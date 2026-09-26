import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { tenantStorage } from '../core/tenant/tenant.context';
import { FollowUpStatus, FollowUpType, NotificationType } from '@prisma/client';
import { WhatsappService } from '../webhooks/whatsapp.service';
import { EventsGateway } from '../events/events/events.gateway';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import type { SalesAgentService } from '../webhooks/interfaces/agent.interface';
import { ActionExecutorService } from '../webhooks/action-executor.service';
import { NotificationEmitterService } from '../notifications/notification-emitter.service';
import { DeliveryAuthService } from '../webhooks/delivery-auth.service';
import { OutboundAttemptService } from '../webhooks/outbound-attempt.service';
import { randomUUID } from 'node:crypto';

@Processor('follow-up')
export class FollowUpProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(FollowUpProcessor.name);
  private salesAgentService: SalesAgentService | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
    private readonly eventsGateway: EventsGateway,
    private readonly actionExecutor: ActionExecutorService,
    private readonly notificationEmitter: NotificationEmitterService,
    private readonly deliveryAuth: DeliveryAuthService,
    private readonly outboundAttempts: OutboundAttemptService,
    @Inject('AI_AGENT_PACKAGE') private readonly client: ClientGrpc,
  ) {
    super();
  }

  onModuleInit() {
    this.salesAgentService =
      this.client.getService<SalesAgentService>('SalesAgent');
  }

  private async recordCancellation(
    conversationId: string,
    organizationId: string,
    reason: string,
  ) {
    const sysMsg = await this.prisma.message.create({
      data: {
        conversationId,
        content: `[SYSTEM: Follow-up Cancelled] ${reason}`,
        type: 'SYSTEM_PROMPT',
        handledBy: 'AI',
        status: 'CANCELLED',
      },
    });
    void this.eventsGateway.broadcastNewMessage(organizationId, sysMsg);
  }

  private async cancelPendingDelivery(
    followUpId: string,
    conversationId: string,
    reason: string,
  ) {
    await this.prisma.scheduledFollowUp.updateMany({
      where: { id: followUpId, status: FollowUpStatus.PENDING },
      data: {
        status: FollowUpStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });
    await this.prisma.message.updateMany({
      where: {
        conversationId,
        idempotencyKey: { startsWith: `followUp-${followUpId}-` },
        status: 'PENDING',
      },
      data: { status: 'CANCELLED' },
    });
  }

  async process(job: Job<{ followUpId: string }>): Promise<any> {
    const followUpMeta = await tenantStorage.run(
      { isSystemBypass: true },
      async () =>
        await this.prisma.scheduledFollowUp.findUnique({
          where: { id: job.data.followUpId },
          select: { organizationId: true },
        }),
    );

    if (!followUpMeta) return;

    return tenantStorage.run(
      { organizationId: followUpMeta.organizationId, isSystemBypass: false },
      async () => {
        const followUp = await this.prisma.scheduledFollowUp.findUnique({
          where: { id: job.data.followUpId },
          include: {
            conversation: { include: { lead: true, channel: true } },
            organization: { include: { aiPersona: true } },
          },
        });

        if (!followUp) return;

        // Ensure it's still pending
        if (followUp.status !== FollowUpStatus.PENDING) {
          this.logger.log(
            `Follow-up ${followUp.id} is ${followUp.status}, skipping.`,
          );
          return;
        }
        const owner = randomUUID();
        const acquired = await this.prisma.scheduledFollowUp.updateMany({
          where: {
            id: followUp.id,
            status: FollowUpStatus.PENDING,
            OR: [
              { processingOwner: null },
              { processingLeaseUntil: { lt: new Date() } },
            ],
          },
          data: {
            processingOwner: owner,
            processingLeaseUntil: new Date(Date.now() + 120_000),
          },
        });
        if (acquired.count !== 1) return;
        let leaseLost = false;
        const heartbeat = setInterval(() => {
          void this.prisma.scheduledFollowUp
            .updateMany({
              where: { id: followUp.id, processingOwner: owner },
              data: { processingLeaseUntil: new Date(Date.now() + 120_000) },
            })
            .then((result) => {
              if (result.count !== 1) leaseLost = true;
            })
            .catch(() => {
              leaseLost = true;
            });
        }, 30_000);
        try {
          const conversation = followUp.conversation;
          const organization = followUp.organization;

          if (
            !organization ||
            !organization.isActive ||
            organization.deleted_at ||
            !organization.aiPersona
          ) {
            this.logger.warn(
              `Organization is inactive or missing. Cancelling follow-up.`,
            );
            await this.prisma.scheduledFollowUp.update({
              where: { id: followUp.id },
              data: {
                status: FollowUpStatus.CANCELLED,
                cancelReason: 'Organization Inactive',
              },
            });
            return;
          }

          if ((conversation as any).lead?.optedOutAt) {
            this.logger.log(
              `Conversation ${conversation.id} opted out. Cancelling follow-up.`,
            );
            await this.prisma.scheduledFollowUp.update({
              where: { id: followUp.id },
              data: {
                status: FollowUpStatus.CANCELLED,
                cancelReason: 'Consent withdrawn',
              },
            });
            return;
          }

          // If attempt 2 (24h) and no response, notify humans instead of sending a message
          if (
            followUp.type === FollowUpType.AUTO_NO_REPLY &&
            followUp.attempt >= 2
          ) {
            this.logger.log(
              `Auto follow-up attempt ${followUp.attempt} for Conv ${conversation.id}. Notifying human.`,
            );

            await this.prisma.scheduledFollowUp.update({
              where: { id: followUp.id },
              data: { status: FollowUpStatus.SENT, sentAt: new Date() }, // Mark as sent/handled
            });

            // Notify human agent
            const lead = conversation.lead;
            if (lead) {
              const memberships =
                await this.prisma.organizationMembership.findMany({
                  where: {
                    organizationId: organization.id,
                    status: 'ACTIVE',
                    deletedAt: null,
                  },
                });

              for (const membership of memberships) {
                await this.notificationEmitter.send({
                  organizationId: organization.id,
                  userId: membership.userId,
                  type: NotificationType.SYSTEM_ALERT,
                  title: 'Unresponsive Lead',
                  body: `${lead.firstName || 'A lead'} has not responded to AI follow-ups. Human intervention recommended.`,
                  referenceId: lead.id,
                  referenceType: 'LEAD',
                });
              }
            }
            return;
          }

          // Otherwise, we get the AI to generate a follow-up
          const channel = conversation.channel;
          if (
            !channel ||
            channel.status !== 'ACTIVE' ||
            !channel.credentialId ||
            !channel.providerAccountId
          ) {
            this.logger.warn(
              `Delivery aborted: Bound channel is missing or inactive for conversation ${conversation.id}`,
            );
            await this.recordCancellation(
              conversation.id,
              organization.id,
              'Follow-up aborted because the bound WhatsApp channel is missing or inactive.',
            );
            await this.cancelPendingDelivery(
              followUp.id,
              conversation.id,
              'Bound channel unavailable',
            );
            return;
          }
          const recentInbound = await this.prisma.message.count({
            where: {
              conversationId: conversation.id,
              type: { in: ['LEAD_TEXT', 'LEAD_MEDIA'] },
              createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
          });
          if (!recentInbound) {
            await this.prisma.scheduledFollowUp.update({
              where: { id: followUp.id },
              data: {
                status: FollowUpStatus.CANCELLED,
                cancelledAt: new Date(),
                cancelReason:
                  'Outside WhatsApp customer-service window; approved template required',
              },
            });
            return;
          }

          const totalMessageCount = await this.prisma.message.count({
            where: { conversationId: conversation.id },
          });
          const leadSummary = (conversation as any)?.lead?.summary || '';

          const persona = organization.aiPersona;
          const businessRulesJson = persona?.businessRules
            ? JSON.stringify(persona.businessRules)
            : '{}';

          const contextMsg =
            followUp.type === FollowUpType.AUTO_NO_REPLY
              ? "This is an automatic follow-up. The customer hasn't replied."
              : `This is a scheduled follow-up. Context: ${followUp.aiContext || 'Follow up'}`;

          try {
            const idempotencyKeyBase = `followUp-${followUp.id}`;

            // Check if we already generated bubbles for this job
            let existingBubbles = await this.prisma.message.findMany({
              where: {
                idempotencyKey: { startsWith: `${idempotencyKeyBase}-` },
              },
              orderBy: { createdAt: 'asc' },
            });

            if (existingBubbles.length === 0) {
              // Backward compatibility check for old single message row
              const legacyMessage = await this.prisma.message.findUnique({
                where: { idempotencyKey: idempotencyKeyBase },
              });

              if (legacyMessage && legacyMessage.metaMessageId) {
                this.logger.log(
                  `Idempotency check: Follow-up ${followUp.id} already sent. Skipping.`,
                );
                return;
              }

              const aiResponse = await lastValueFrom(
                this.salesAgentService!.generateReply({
                  organizationId: organization.id,
                  conversationId: conversation.id,
                  newMessageIds: [],
                  clinicName: persona?.clinicName || 'OmniDesk Clinic',
                  agentTone: persona?.tone || 'Professional and empathetic',
                  businessRulesJson: businessRulesJson,
                  totalMessageCount,
                  leadSummary,
                  isFollowUp: true,
                  followUpContext: contextMsg,
                }),
              );

              const { replyText, mediaUrl, actions } = aiResponse;

              if (actions && actions.length > 0) {
                const actionResult = await this.actionExecutor.executeActions(
                  organization.id,
                  conversation.id,
                  actions,
                );
                if (actionResult.failed > 0) {
                  throw new Error(
                    `Critical action execution failure (${actionResult.failed} failed), aborting follow-up delivery to prevent inconsistency`,
                  );
                }
              }

              if (
                replyText &&
                replyText.includes('[SYSTEM: DO_NOT_SEND_REPLY]')
              ) {
                this.logger.log('AI requested to skip follow-up. Cancelling.');
                await this.prisma.scheduledFollowUp.update({
                  where: { id: followUp.id },
                  data: {
                    status: FollowUpStatus.CANCELLED,
                    cancelReason: 'AI chose not to reply',
                  },
                });
                return;
              }

              let safeMediaUrl = mediaUrl;
              let safeReplyText = replyText;

              if (safeMediaUrl) {
                const revoked =
                  await this.prisma.organizationExperience.findFirst({
                    where: {
                      organizationId: organization.id,
                      consentObtained: false,
                      OR: [
                        { beforeImageUrl: safeMediaUrl },
                        { afterImageUrl: safeMediaUrl },
                      ],
                    },
                  });
                if (revoked) {
                  this.logger.warn(
                    `Blocked outbound transmission of revoked media URL: ${safeMediaUrl}`,
                  );
                  safeMediaUrl = undefined;
                  safeReplyText =
                    '[Media removed due to privacy rules] ' +
                    (safeReplyText || '');
                }
              }

              const bubblesToCreate: any[] = [];
              let bubbleIndex = 0;

              if (safeMediaUrl) {
                bubblesToCreate.push({
                  conversationId: conversation.id,
                  content: safeReplyText || '[Image Sent]',
                  mediaUrl: safeMediaUrl,
                  idempotencyKey: `${idempotencyKeyBase}-bubble-${bubbleIndex++}`,
                  type: conversation.aiPaused ? 'AI_DRAFT' : 'AI_TEXT',
                  handledBy: 'AI',
                  status: 'PENDING',
                });
              } else if (safeReplyText) {
                const messages = safeReplyText
                  .split('|||')
                  .map((m: any) => m.trim())
                  .filter((m: any) => m.length > 0);
                for (const msg of messages) {
                  bubblesToCreate.push({
                    conversationId: conversation.id,
                    content: msg,
                    idempotencyKey: `${idempotencyKeyBase}-bubble-${bubbleIndex++}`,
                    type: conversation.aiPaused ? 'AI_DRAFT' : 'AI_TEXT',
                    handledBy: 'AI',
                    status: 'PENDING',
                  });
                }
              }

              if (bubblesToCreate.length > 0) {
                await this.prisma.message.createMany({
                  data: bubblesToCreate.map((bubble) => ({
                    ...bubble,
                    metadata: { generationVersion: conversation.stateVersion },
                  })),
                });
              }

              existingBubbles = await this.prisma.message.findMany({
                where: {
                  idempotencyKey: { startsWith: `${idempotencyKeyBase}-` },
                },
                orderBy: { createdAt: 'asc' },
              });
            }

            if (
              existingBubbles.some(
                (bubble) =>
                  (bubble.metadata as { generationVersion?: number } | null)
                    ?.generationVersion !== conversation.stateVersion,
              )
            ) {
              await this.cancelPendingDelivery(
                followUp.id,
                conversation.id,
                'Conversation changed after generation',
              );
              return;
            }

            if (existingBubbles.length === 0) {
              this.logger.warn(
                `No bubbles to send for follow-up ${followUp.id}`,
              );
              await this.cancelPendingDelivery(
                followUp.id,
                conversation.id,
                'No outbound bubble',
              );
              return;
            }

            if (conversation.aiPaused) {
              this.logger.log(
                `Conversation ${conversation.id} is paused. Saving follow-up as draft.`,
              );
              await this.prisma.scheduledFollowUp.update({
                where: { id: followUp.id },
                data: { status: FollowUpStatus.SENT },
              });

              const lead = (conversation as any).lead;
              if (lead?.assignedAgentId) {
                void this.eventsGateway.broadcastNotification(
                  lead.assignedAgentId as string,
                  {
                    title: 'Draft Follow-Up Ready',
                    body: `AI generated a draft follow-up for ${lead.firstName} ${lead.lastName}.`,
                    referenceId: conversation.id,
                    type: 'SYSTEM_ALERT',
                  },
                );
              }

              for (const bubble of existingBubbles) {
                void this.eventsGateway.broadcastNewMessage(
                  organization.id,
                  bubble,
                );
              }
              return;
            }

            try {
              const expectedVersion = conversation.stateVersion;
              for (let i = 0; i < existingBubbles.length; i++) {
                const bubble = existingBubbles[i];
                if (bubble.status === 'SENT') continue;
                const currentFollowUp =
                  await this.prisma.scheduledFollowUp.findUnique({
                    where: { id: followUp.id },
                    select: { status: true, processingOwner: true },
                  });
                if (
                  leaseLost ||
                  currentFollowUp?.status !== FollowUpStatus.PENDING ||
                  currentFollowUp.processingOwner !== owner
                )
                  return;

                const authOk = await this.deliveryAuth.authorizeDelivery(
                  organization.id,
                  conversation.id,
                  expectedVersion,
                );
                if (!authOk) {
                  this.logger.warn(
                    `Follow-up delivery aborted for bubble ${i} (Org: ${organization.id}, Conv: ${conversation.id})`,
                  );
                  await this.recordCancellation(
                    conversation.id,
                    organization.id,
                    'Follow-up aborted prior to send due to authorization failure.',
                  );
                  await this.cancelPendingDelivery(
                    followUp.id,
                    conversation.id,
                    'Delivery authorization changed',
                  );
                  return;
                }

                const currentConv = await this.prisma.conversation.findUnique({
                  where: { id: conversation.id },
                  include: { lead: true, channel: true },
                });
                if (
                  currentConv?.aiPaused ||
                  (currentConv as any)?.lead?.optedOutAt
                ) {
                  this.logger.log(
                    `AI paused or opted out mid-transmission. Aborting remaining follow-up bubbles.`,
                  );
                  await this.cancelPendingDelivery(
                    followUp.id,
                    conversation.id,
                    'Conversation paused or opted out',
                  );
                  return;
                }

                const result = await this.outboundAttempts.sendBubble(
                  organization.id,
                  conversation.id,
                  bubble,
                  expectedVersion,
                  'follow-up',
                );
                if (result === 'WAITING')
                  throw new Error('OUTBOUND_UNRESOLVED');
                if (result === 'FAILED' || result === 'CANCELLED') {
                  await this.prisma.scheduledFollowUp.update({
                    where: { id: followUp.id },
                    data: {
                      status: FollowUpStatus.CANCELLED,
                      cancelledAt: new Date(),
                      cancelReason: `Outbound attempt ${result.toLowerCase()}`,
                    },
                  });
                  return;
                }
                const updatedMsg = await this.prisma.message.findUniqueOrThrow({
                  where: { id: bubble.id },
                });

                void this.eventsGateway.broadcastNewMessage(
                  organization.id,
                  updatedMsg,
                );
                if (i < existingBubbles.length - 1) {
                  await new Promise((resolve) => setTimeout(resolve, 1500));
                }
              }

              await this.prisma.conversation.update({
                where: { id: conversation.id },
                data: { updatedAt: new Date() },
              });

              await this.prisma.scheduledFollowUp.update({
                where: { id: followUp.id },
                data: { status: FollowUpStatus.SENT, sentAt: new Date() },
              });
            } catch (error) {
              this.logger.error(
                `FOLLOW_UP_OUTBOUND_UNRESOLVED followUp=${followUp.id}`,
              );
              throw error;
            }
          } catch (error) {
            this.logger.error(
              `Failed to process follow-up: ${error instanceof Error ? error.message : 'Unknown'}`,
            );
            this.logger.debug(error);
            throw error;
          }
        } finally {
          clearInterval(heartbeat);
          await this.prisma.scheduledFollowUp.updateMany({
            where: { id: followUp.id, processingOwner: owner },
            data: { processingOwner: null, processingLeaseUntil: null },
          });
        }
      },
    );
  }
}
