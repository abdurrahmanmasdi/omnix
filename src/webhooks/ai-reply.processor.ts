import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { tenantStorage } from '../core/tenant/tenant.context';
import { WhatsappService } from './whatsapp.service';
import { EventsGateway } from '../events/events/events.gateway';
import { GrpcClientService } from '../grpc-client/grpc-client.service';
import { ActionExecutorService } from './action-executor.service';
import { DeliveryAuthService } from './delivery-auth.service';
import { FollowUpService } from '../follow-ups/follow-up.service';
import { AuditService } from '../audit/audit.service';
import { InboundClaimService } from './inbound-claim.service';
import { OutboundAttemptService } from './outbound-attempt.service';
import { AfterSendAction, splitAfterSendActions } from './deferred-actions';
import {
  PatientLanguage,
  actionFallbackText,
  defaultDisclosure,
  patientLanguage,
} from './patient-copy';
import { Message } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ToolActionWire } from './interfaces/agent.interface';

/** A stable UUID for an idempotency claim row. */
function deterministicUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
import {
  AGENT_CONTRACT_VERSION,
  isCompatibleAgentVersion,
} from './contracts/agent-contract';

@Processor('ai-reply') // 🚀 Listens to the delay queue
export class AiReplyProcessor extends WorkerHost {
  private readonly logger = new Logger(AiReplyProcessor.name);

  private buildDisclosure(
    template: string | null | undefined,
    firstName: string | null | undefined,
    agentName: string | null | undefined,
    clinicName: string,
    language: PatientLanguage,
  ): string {
    if (!template)
      return defaultDisclosure(language, {
        firstName,
        agentName: agentName || 'Assistant',
        clinicName,
      });
    return template
      .replaceAll('{{firstName}}', firstName || 'there')
      .replaceAll('{{agentName}}', agentName || 'Assistant')
      .replaceAll('{{clinicName}}', clinicName);
  }

  /** Lead preference, then this batch's patient texts (KI-060). */
  private async batchLanguage(
    lead:
      | { preferredLanguage?: string | null; primaryLanguage?: string | null }
      | null
      | undefined,
    messageIds: string[],
  ): Promise<PatientLanguage> {
    const texts = await this.prisma.message.findMany({
      where: { id: { in: messageIds }, type: 'LEAD_TEXT' },
      select: { content: true },
    });
    return patientLanguage(
      lead ?? null,
      texts.map((row) => row.content),
    );
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
    private readonly eventsGateway: EventsGateway,
    private readonly actionExecutor: ActionExecutorService,
    private readonly followUpService: FollowUpService,
    private readonly auditService: AuditService,
    private readonly deliveryAuth: DeliveryAuthService,
    private readonly inboundClaims: InboundClaimService,
    private readonly outboundAttempts: OutboundAttemptService,
    private readonly grpcClient: GrpcClientService,
  ) {
    super();
  }

  private async recordCancellation(
    conversationId: string,
    organizationId: string,
    reason: string,
    jobId?: string,
  ) {
    if (jobId) {
      const existing = await this.prisma.message.findUnique({
        where: { idempotencyKey: jobId },
      });
      if (existing) {
        const msg = await this.prisma.message.update({
          where: { id: existing.id },
          data: {
            content: `[SYSTEM: Generation Cancelled] ${reason}`,
            status: 'CANCELLED',
          },
        });
        void this.eventsGateway.broadcastNewMessage(organizationId, msg);
        return;
      }
    }

    const msg = await this.prisma.message.create({
      data: {
        conversationId,
        metaMessageId: `cancel-${Date.now()}`,
        content: `[SYSTEM: Generation Cancelled] ${reason}`,
        type: 'SYSTEM_PROMPT',
        handledBy: 'AI',
        status: 'CANCELLED',
      },
    });
    void this.eventsGateway.broadcastNewMessage(organizationId, msg);
  }

  /**
   * Runs the deferred handoff/pause once the reply bubbles went out, then
   * clears the pending flag on each bubble (keeping its other metadata).
   */
  private async runAfterSendAction(
    organizationId: string,
    conversationId: string,
    type: AfterSendAction,
    bubbles: Message[],
  ) {
    const result = await this.actionExecutor.executeActions(
      organizationId,
      conversationId,
      [{ type, payload: '{}' }],
    );
    if (result.executed !== 1 || result.failed || result.rejected)
      throw new Error('ACTION_FALLBACK_HANDOFF_FAILED');
    for (const bubble of bubbles) {
      await this.prisma.message.update({
        where: { id: bubble.id },
        data: {
          metadata: {
            ...((bubble.metadata as Record<string, unknown> | null) ?? {}),
            pendingHandoff: false,
            pendingPause: false,
          },
        },
      });
    }
  }

  /**
   * The bubble key prefix for this generation. Unsent bubbles of an older
   * generation of the same batch are cancelled. Bubbles created before
   * version-scoped keys (same version, old key) are reused.
   */
  private async currentBatchKey(
    conversationId: string,
    batchRoot: string,
    version: number,
  ): Promise<string> {
    const batchKey = `${batchRoot}-v${version}`;
    const legacy = await this.prisma.message.findMany({
      where: {
        conversationId,
        idempotencyKey: { startsWith: `${batchRoot}-bubble-` },
      },
      select: { metadata: true },
    });
    if (
      legacy.length > 0 &&
      legacy.every(
        (bubble) =>
          (bubble.metadata as { generationVersion?: number } | null)
            ?.generationVersion === version,
      )
    )
      return batchRoot;
    await this.prisma.message.updateMany({
      where: {
        conversationId,
        status: 'PENDING',
        idempotencyKey: { startsWith: `${batchRoot}-` },
        NOT: { idempotencyKey: { startsWith: `${batchKey}-` } },
      },
      data: { status: 'CANCELLED' },
    });
    return batchKey;
  }

  /**
   * Executes a generation's actions at most once (B9): a job retry after the
   * actions ran (e.g. a crash before the bubbles were stored) must not send
   * a second staff alert or schedule a second follow-up. The claim row also
   * remembers whether the first run needed the fallback reply.
   * Returns true when the fallback reply + handoff is required.
   */
  private async executeActionsOnce(
    organizationId: string,
    conversationId: string,
    batchKey: string,
    actions: ToolActionWire[],
  ): Promise<boolean> {
    const id = deterministicUuid(`${batchKey}:actions`);
    try {
      await this.prisma.auditLog.create({
        data: {
          id,
          organizationId,
          actor: 'ai',
          action: 'ai.actions_executed',
          targetId: conversationId,
          metadata: {
            batchKey,
            actionTypes: actions.map((action) => action.type),
          },
        },
      });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const claim = await this.prisma.auditLog.findUnique({ where: { id } });
      this.logger.warn(
        `AI_ACTIONS_ALREADY_EXECUTED conversationId=${conversationId}`,
      );
      return (
        (claim?.metadata as { fallback?: boolean } | null)?.fallback === true
      );
    }
    const actionResult = await this.actionExecutor.executeActions(
      organizationId,
      conversationId,
      actions,
    );
    const fallback =
      actionResult.outcomes?.some((item) => item.status !== 'EXECUTED') ||
      actionResult.rejected > 0 ||
      actionResult.failed > 0;
    await this.prisma.auditLog.update({
      where: { id },
      data: {
        metadata: {
          batchKey,
          actionTypes: actions.map((action) => action.type),
          fallback,
        },
      },
    });
    return fallback;
  }

  async process(
    job: Job<{
      organizationId: string;
      conversationId: string;
      newMessageIds: string[];
      stateVersion?: number;
    }>,
  ): Promise<any> {
    const { organizationId, conversationId } = job.data;
    return tenantStorage.run(
      { organizationId, isSystemBypass: false },
      async () => {
        const claim = await this.inboundClaims.claim(
          organizationId,
          conversationId,
          job.data.newMessageIds,
        );
        if (!claim) return;
        const {
          owner,
          organization,
          conversation,
          channel,
          messageIds: claimedMessageIds,
        } = claim;
        const expectedVersion = conversation.stateVersion;
        // Bubbles are keyed per conversation version. After a crash and a
        // newer inbound, the claim folds the new message into this batch;
        // the older generation's unsent bubbles are cancelled and the whole
        // batch gets a fresh reply instead of none (B9).
        const batchRoot = `ai-${claimedMessageIds[0]}`;
        const batchKey = await this.currentBatchKey(
          conversationId,
          batchRoot,
          expectedVersion,
        );
        let leaseLost = false;
        const heartbeat = setInterval(() => {
          void this.inboundClaims
            .heartbeat(conversationId, owner, claimedMessageIds)
            .then((alive) => {
              if (!alive) leaseLost = true;
            })
            .catch(() => {
              leaseLost = true;
              this.logger.warn(
                `INBOUND_HEARTBEAT_FAILED conversationId=${conversationId}`,
              );
            });
        }, 30_000);
        try {
          // 🚀 NEW: Get total message count for python summarization
          const totalMessageCount = await this.prisma.message.count({
            where: { conversationId: conversationId },
          });

          // 🚀 NEW: Extract existing summary from the lead
          // We use @ts-ignore or explicit typing here if TS complains before prisma generate,
          // but assuming schema is generated this will just work.
          const leadSummary = (conversation as any)?.lead?.summary || '';

          let failed = false;
          try {
            let handoffAfterSend = false;
            let pauseAfterSend = false;
            // Check if we already generated bubbles for this job
            let existingBubbles = await this.prisma.message.findMany({
              where: { idempotencyKey: { startsWith: `${batchKey}-` } },
              orderBy: { createdAt: 'asc' },
            });

            // 1. If we haven't generated anything yet, call the AI and create the bubbles in the database
            if (existingBubbles.length === 0) {
              const clinicName =
                organization.aiPersona?.clinicName || organization.name;
              const language = await this.batchLanguage(
                conversation.lead,
                claimedMessageIds,
              );
              let disclosureText: string | undefined = undefined;
              if (!conversation.aiDisclosureSent && channel?.credentialId) {
                disclosureText = this.buildDisclosure(
                  organization.aiPersona?.aiDisclosureText,
                  conversation.lead?.firstName,
                  organization.aiPersona?.agentName,
                  clinicName,
                  language,
                );
              }

              // Simulate Typing Indicator on WhatsApp
              if (channel?.credentialId && claimedMessageIds.length > 0) {
                try {
                  const lastMsg = await this.prisma.message.findUnique({
                    where: {
                      id: claimedMessageIds[claimedMessageIds.length - 1],
                    },
                    select: { metaMessageId: true },
                  });
                  if (lastMsg?.metaMessageId) {
                    await this.whatsappService.sendTypingIndicator(
                      channel.credentialId,
                      organizationId,
                      lastMsg.metaMessageId,
                    );
                  }
                } catch {
                  this.logger.warn(
                    `TYPING_INDICATOR_FAILED conversationId=${conversationId}`,
                  );
                }
              }

              const persona = organization.aiPersona;
              const businessRulesJson = persona?.businessRules
                ? JSON.stringify(persona.businessRules)
                : '{}';

              // THE MAGIC BRIDGE: Call Python over gRPC!
              const aiResponse = await this.grpcClient.generateReply({
                organizationId: organization.id,
                conversationId: conversationId,
                newMessageIds: claimedMessageIds,
                clinicName,
                agentTone: persona?.tone || 'Professional and empathetic',
                businessRulesJson: businessRulesJson,
                totalMessageCount: totalMessageCount,
                leadSummary: leadSummary,
                contractVersion: AGENT_CONTRACT_VERSION,
              });
              if (!isCompatibleAgentVersion(aiResponse.contractVersion))
                throw new Error('AI_CONTRACT_VERSION_UNSUPPORTED');

              let { replyText, mediaUrl } = aiResponse;
              const { actions } = aiResponse;

              if (
                leaseLost ||
                !(await this.inboundClaims.owns(conversationId, owner))
              ) {
                throw new Error('INBOUND_LEASE_LOST');
              }
              if (
                !(await this.deliveryAuth.authorizeDelivery(
                  organizationId,
                  conversationId,
                  expectedVersion,
                ))
              ) {
                return;
              }

              // Execute Virtual Tool Actions (CRM Updates). Handoff / pause
              // run after the reply is sent (B7), see splitAfterSendActions.
              const { immediate, afterSend } = splitAfterSendActions(actions);
              handoffAfterSend = afterSend === 'HANDOFF_TO_HUMAN';
              pauseAfterSend = afterSend === 'PAUSE_CONVERSATION';
              if (immediate.length > 0) {
                const fallback = await this.executeActionsOnce(
                  organization.id,
                  conversationId,
                  batchKey,
                  immediate,
                );
                if (fallback) {
                  this.logger.warn(
                    `ACTION_FALLBACK_REQUIRED conversationId=${conversationId}`,
                  );
                  handoffAfterSend = true;
                  replyText = actionFallbackText(language);
                  mediaUrl = undefined;
                }
              }

              if (
                replyText &&
                replyText.includes('[SYSTEM: DO_NOT_SEND_REPLY]')
              ) {
                this.logger.log(
                  'AI requested to sleep. Aborting WhatsApp message delivery.',
                );
                return;
              }

              let safeMediaUrl = mediaUrl;
              let safeReplyText = replyText;

              if (safeMediaUrl) {
                // Check revocation
                const revoked =
                  await this.prisma.organizationExperience.findFirst({
                    where: {
                      organizationId: organizationId,
                      consentObtained: false,
                      OR: [
                        { beforeImageUrl: safeMediaUrl },
                        { afterImageUrl: safeMediaUrl },
                      ],
                    },
                  });
                if (revoked) {
                  this.logger.warn(
                    `REVOKED_MEDIA_BLOCKED conversationId=${conversationId}`,
                  );
                  safeMediaUrl = undefined;
                  safeReplyText =
                    '[Media removed due to privacy rules] ' +
                    (safeReplyText || '');
                }
              }

              const bubblesToCreate: any[] = [];
              let bubbleIndex = 0;

              // Disclosure bubble
              if (disclosureText) {
                bubblesToCreate.push({
                  role: 'disclosure',
                  conversationId,
                  content: disclosureText,
                  idempotencyKey: `${batchKey}-bubble-${bubbleIndex++}`,
                  type: 'AI_TEXT',
                  handledBy: 'AI',
                  status: 'PENDING',
                });
              }

              // Media bubble
              if (safeMediaUrl) {
                bubblesToCreate.push({
                  conversationId,
                  content: safeReplyText || '[Image Sent]', // Optional caption
                  mediaUrl: safeMediaUrl,
                  idempotencyKey: `${batchKey}-bubble-${bubbleIndex++}`,
                  type: 'AI_TEXT',
                  handledBy: 'AI',
                  status: 'PENDING',
                });
                // If it had media, the text acts as caption. We don't need text bubbles.
              } else if (safeReplyText) {
                const messages = safeReplyText
                  .split('|||')
                  .map((m: any) => m.trim())
                  .filter((m: any) => m.length > 0);
                for (const msg of messages) {
                  bubblesToCreate.push({
                    conversationId,
                    content: msg,
                    idempotencyKey: `${batchKey}-bubble-${bubbleIndex++}`,
                    type: 'AI_TEXT',
                    handledBy: 'AI',
                    status: 'PENDING',
                  });
                }
              }

              if (bubblesToCreate.length === 0 && !actions?.length) {
                this.logger.warn(
                  `AI returned empty reply and no actions for Conv: ${conversationId}`,
                );
                return;
              }

              // Create bubbles in DB
              if (bubblesToCreate.length > 0) {
                await this.prisma.message.createMany({
                  data: bubblesToCreate.map(({ role, ...bubble }) => ({
                    ...bubble,
                    metadata: {
                      // The disclosure is tracked by role, not by its text,
                      // so custom/localized templates count too (KI-032).
                      ...(role ? { role } : {}),
                      generationVersion: expectedVersion,
                      pendingHandoff: handoffAfterSend,
                      pendingPause: pauseAfterSend,
                    },
                  })),
                });
              }

              existingBubbles = await this.prisma.message.findMany({
                where: { idempotencyKey: { startsWith: `${batchKey}-` } },
                orderBy: { createdAt: 'asc' },
              });
            } // end of if (existingBubbles.length === 0)

            handoffAfterSend =
              handoffAfterSend ||
              existingBubbles.some(
                (bubble) =>
                  (bubble.metadata as { pendingHandoff?: boolean } | null)
                    ?.pendingHandoff === true,
              );
            pauseAfterSend =
              !handoffAfterSend &&
              (pauseAfterSend ||
                existingBubbles.some(
                  (bubble) =>
                    (bubble.metadata as { pendingPause?: boolean } | null)
                      ?.pendingPause === true,
                ));

            if (
              existingBubbles.some(
                (bubble) =>
                  (bubble.metadata as { generationVersion?: number } | null)
                    ?.generationVersion !== expectedVersion,
              )
            ) {
              await this.prisma.message.updateMany({
                where: {
                  conversationId,
                  idempotencyKey: { startsWith: `${batchKey}-` },
                  status: 'PENDING',
                },
                data: { status: 'CANCELLED' },
              });
              return;
            }

            // 2. Transmit bubbles to Meta
            for (let i = 0; i < existingBubbles.length; i++) {
              const bubble = existingBubbles[i];
              if (bubble.status === 'SENT') continue;

              if (
                leaseLost ||
                !(await this.inboundClaims.owns(conversationId, owner))
              ) {
                throw new Error('INBOUND_LEASE_LOST');
              }
              // Re-check auth before each send
              const authOk = await this.deliveryAuth.authorizeDelivery(
                organizationId,
                conversationId,
                expectedVersion,
              );
              if (!authOk) {
                await this.prisma.message.updateMany({
                  where: {
                    conversationId,
                    idempotencyKey: { startsWith: `${batchKey}-` },
                    status: 'PENDING',
                  },
                  data: { status: 'CANCELLED' },
                });
                this.logger.warn(
                  `Delivery aborted for bubble ${i} (Org: ${organizationId}, Conv: ${conversationId})`,
                );
                await this.recordCancellation(
                  conversationId,
                  organizationId,
                  'Delivery aborted prior to text send due to authorization failure or version mismatch.',
                  bubble.idempotencyKey || undefined,
                );
                return;
              }

              // Also recheck if conversation got paused in between bubbles
              const currentConv = await this.prisma.conversation.findUnique({
                where: { id: conversationId },
                include: { lead: true, channel: true },
              });
              if (
                currentConv?.aiPaused ||
                (currentConv as any)?.lead?.optedOutAt
              ) {
                await this.prisma.message.updateMany({
                  where: {
                    conversationId,
                    idempotencyKey: { startsWith: `${batchKey}-` },
                    status: 'PENDING',
                  },
                  data: { status: 'CANCELLED' },
                });
                this.logger.log(
                  `AI paused or opted out mid-transmission. Aborting remaining bubbles.`,
                );
                return;
              }

              const result = await this.outboundAttempts.sendBubble(
                organizationId,
                conversationId,
                bubble,
                expectedVersion,
              );
              if (result === 'WAITING') throw new Error('OUTBOUND_UNRESOLVED');
              if (result === 'FAILED' || result === 'CANCELLED') {
                if (handoffAfterSend)
                  throw new Error('ACTION_FALLBACK_SEND_FAILED');
                return;
              }
              const updatedBubble = await this.prisma.message.findUniqueOrThrow(
                {
                  where: { id: bubble.id },
                },
              );

              void this.eventsGateway.broadcastNewMessage(
                organizationId,
                updatedBubble,
              );

              if (
                !currentConv?.aiDisclosureSent &&
                (bubble.metadata as { role?: string } | null)?.role ===
                  'disclosure'
              ) {
                await this.prisma.conversation.update({
                  where: { id: conversationId },
                  data: { aiDisclosureSent: true },
                });
                await this.auditService.record({
                  organizationId: organizationId,
                  action: 'ai.disclosure_sent',
                  targetId: conversationId,
                  actor: 'ai',
                  metadata: { messageId: updatedBubble.metaMessageId },
                });
              }
              if (i < existingBubbles.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 1500));
              }
            } // end of transmission loop

            if (handoffAfterSend || pauseAfterSend) {
              await this.runAfterSendAction(
                organization.id,
                conversationId,
                handoffAfterSend ? 'HANDOFF_TO_HUMAN' : 'PAUSE_CONVERSATION',
                existingBubbles,
              );
              return;
            }

            // A follow-up must not be scheduled for a reply whose provider
            // acceptance is still unknown. Replays can arrive after a crash.
            if (existingBubbles.length > 0) {
              const alreadyScheduled =
                await this.prisma.scheduledFollowUp.findFirst({
                  where: { conversationId, status: 'PENDING' },
                });
              if (!alreadyScheduled) {
                await this.followUpService.scheduleAutoFollowUps(
                  conversationId,
                  organization.id,
                );
              }
            }

            // 3. Mark inbound messages as processed and update conversation timestamp
            await this.prisma.conversation.update({
              where: { id: conversationId },
              data: { updatedAt: new Date() },
            });
          } catch (error) {
            failed = true;
            this.logger.error(
              `AI_REPLY_FAILED conversationId=${conversationId}`,
            );
            throw error;
          } finally {
            await this.inboundClaims.finish(
              conversationId,
              owner,
              claimedMessageIds,
              failed ? 'PENDING' : 'PROCESSED',
            );
          }
        } catch (error) {
          // This also covers failures before the inner generation block.
          await this.inboundClaims.finish(
            conversationId,
            owner,
            claimedMessageIds,
            'PENDING',
          );
          throw error;
        } finally {
          clearInterval(heartbeat);
          await this.inboundClaims.releaseConversation(conversationId, owner);
        }
      },
    );
  }
}
