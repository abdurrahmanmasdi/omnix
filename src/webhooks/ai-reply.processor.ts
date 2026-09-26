import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { tenantStorage } from '../core/tenant/tenant.context';
import { WhatsappService } from './whatsapp.service';
import { EventsGateway } from '../events/events/events.gateway';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import type { SalesAgentService } from './interfaces/agent.interface';
import { ActionExecutorService } from './action-executor.service';
import { DeliveryAuthService } from './delivery-auth.service';
import { FollowUpService } from '../follow-ups/follow-up.service';
import { AuditService } from '../audit/audit.service';

@Processor('ai-reply') // 🚀 Listens to the delay queue
export class AiReplyProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AiReplyProcessor.name);
  private salesAgentService: SalesAgentService | undefined;

  private buildDisclosure(
    template: string | null | undefined,
    firstName: string | null | undefined,
    agentName: string | null | undefined,
    clinicName: string | null | undefined,
  ): string {
    const fallback =
      "Hi {{firstName}}! 👋 I'm {{agentName}}, the digital assistant for {{clinicName}}. I'm an AI, not a doctor, but I'm here to help you with info about our services, pricing, and booking. If you ever need a human medical coordinator, just say 'human' and I'll connect you right away. How can I help you today?";
    return (template || fallback)
      .replaceAll('{{firstName}}', firstName || 'there')
      .replaceAll('{{agentName}}', agentName || 'Assistant')
      .replaceAll('{{clinicName}}', clinicName || 'OmniDesk Clinic');
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
    private readonly eventsGateway: EventsGateway,
    private readonly actionExecutor: ActionExecutorService,
    private readonly followUpService: FollowUpService,
    private readonly auditService: AuditService,
    private readonly deliveryAuth: DeliveryAuthService,
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
        this.eventsGateway.broadcastNewMessage(organizationId, msg);
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
    this.eventsGateway.broadcastNewMessage(organizationId, msg);
  }

  async process(
    job: Job<{
      organizationId: string;
      conversationId: string;
      customerPhone: string;
      newMessageIds: string[];
      stateVersion?: number;
    }>,
  ): Promise<any> {
    return tenantStorage.run({ isSystemBypass: true }, async () => {
      const { organizationId, conversationId, customerPhone, stateVersion } =
        job.data;

      const authoritativeIds = job.data.newMessageIds || [];
      const pendingMessages = await this.prisma.message.findMany({
        where: {
          id: { in: authoritativeIds },
          status: 'PENDING',
        },
        orderBy: { createdAt: 'asc' },
      });
      const claimedMessageIds = pendingMessages.map((m: any) => m.id);
      if (claimedMessageIds.length === 0) {
        this.logger.log(
          `No pending messages for Conv: ${conversationId} from claimed outbox batch.`,
        );
        return;
      }

      // 🚀 Mark them as PROCESSING durably to claim them for this job
      await this.prisma.message.updateMany({
        where: { id: { in: claimedMessageIds } },
        data: { status: 'PROCESSING' },
      });

      // Ensure the organization exists and has a valid AI persona
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        include: { aiPersona: true },
      });

      if (
        !organization ||
        !organization.isActive ||
        organization.deleted_at ||
        !organization.aiPersona
      ) {
        this.logger.warn(
          `Organization ${organizationId} is inactive, deleted, or missing AI persona. Skipping reply.`,
        );
        return;
      }

      // Ensure the conversation wasn't manually paused by a human during the window
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { lead: true, channel: true },
      });

      const channel = conversation?.channel;
      if (!channel || channel.status !== 'ACTIVE') {
        this.logger.warn(
          `Delivery aborted: Bound channel is missing or inactive for conversation ${conversationId}`,
        );
        await this.recordCancellation(
          conversationId,
          organizationId,
          'Delivery aborted because the bound WhatsApp channel is missing or inactive.',
          job.id,
        );
        return;
      }

      if (conversation?.aiPaused || (conversation as any)?.lead?.optedOutAt) {
        this.logger.log(
          `AI is paused or consent is withdrawn during the debounce window. Skipping AI reply.`,
        );
        return;
      }
      if (!conversation) return;

      // 🚀 NEW: Get total message count for python summarization
      const totalMessageCount = await this.prisma.message.count({
        where: { conversationId: conversationId },
      });

      // 🚀 NEW: Extract existing summary from the lead
      // We use @ts-ignore or explicit typing here if TS complains before prisma generate,
      // but assuming schema is generated this will just work.
      const leadSummary = (conversation as any)?.lead?.summary || '';

      try {
        if (!job.id) throw new Error('Missing job ID for idempotency');

        // Check if we already generated bubbles for this job
        let existingBubbles = await this.prisma.message.findMany({
          where: { idempotencyKey: { startsWith: `${job.id}-` } },
          orderBy: { createdAt: 'asc' },
        });

        // 1. If we haven't generated anything yet, call the AI and create the bubbles in the database
        if (existingBubbles.length === 0) {
          let disclosureText: string | undefined = undefined;
          if (!conversation.aiDisclosureSent && channel?.credentialId) {
            disclosureText = this.buildDisclosure(
              organization.aiPersona?.aiDisclosureText,
              conversation.lead?.firstName,
              organization.aiPersona?.agentName,
              organization.aiPersona?.clinicName,
            );
          }

          // Simulate Typing Indicator on WhatsApp
          if (channel?.credentialId && claimedMessageIds.length > 0) {
            try {
              const lastMsg = await this.prisma.message.findUnique({
                where: { id: claimedMessageIds[claimedMessageIds.length - 1] },
                select: { metaMessageId: true },
              });
              if (lastMsg?.metaMessageId) {
                await this.whatsappService.sendTypingIndicator(
                  channel.credentialId,
                  organizationId,
                  lastMsg.metaMessageId,
                );
              }
            } catch (e: any) {
              this.logger.warn(
                `Typing indicator failed (likely API version mismatch or expired msg): ${e.message}`,
              );
            }
          }

          const persona = organization.aiPersona;
          const businessRulesJson = persona?.businessRules
            ? JSON.stringify(persona.businessRules)
            : '{}';

          // THE MAGIC BRIDGE: Call Python over gRPC!
          const aiResponse = await lastValueFrom(
            this.salesAgentService!.generateReply({
              organizationId: organization.id,
              conversationId: conversationId,
              newMessageIds: claimedMessageIds,
              clinicName: persona?.clinicName || 'OmniDesk Clinic',
              agentTone: persona?.tone || 'Professional and empathetic',
              businessRulesJson: businessRulesJson,
              totalMessageCount: totalMessageCount,
              leadSummary: leadSummary,
            }),
          );

          const { replyText, mediaUrl, actions } = aiResponse;

          // Execute Virtual Tool Actions (CRM Updates)
          if (actions && actions.length > 0) {
            const actionResult = await this.actionExecutor.executeActions(
              organization.id,
              conversationId,
              actions,
            );
            if (actionResult.failed > 0) {
              throw new Error(
                `Critical action execution failure (${actionResult.failed} failed), aborting reply delivery to prevent inconsistency`,
              );
            }
          }

          if (replyText && replyText.includes('[SYSTEM: DO_NOT_SEND_REPLY]')) {
            this.logger.log(
              'AI requested to sleep. Aborting WhatsApp message delivery.',
            );
            return;
          }

          let safeMediaUrl = mediaUrl;
          let safeReplyText = replyText;

          if (safeMediaUrl) {
            // Check revocation
            const revoked = await this.prisma.organizationExperience.findFirst({
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
                `Blocked outbound transmission of revoked media URL: ${safeMediaUrl}`,
              );
              safeMediaUrl = undefined;
              safeReplyText =
                '[Media removed due to privacy rules] ' + (safeReplyText || '');
            }
          }

          const bubblesToCreate: any[] = [];
          let bubbleIndex = 0;

          // Disclosure bubble
          if (disclosureText) {
            bubblesToCreate.push({
              conversationId,
              content: disclosureText,
              idempotencyKey: `${job.id}-bubble-${bubbleIndex++}`,
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
              idempotencyKey: `${job.id}-bubble-${bubbleIndex++}`,
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
                idempotencyKey: `${job.id}-bubble-${bubbleIndex++}`,
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
              data: bubblesToCreate,
            });
          }

          existingBubbles = await this.prisma.message.findMany({
            where: { idempotencyKey: { startsWith: `${job.id}-` } },
            orderBy: { createdAt: 'asc' },
          });

          const hasCustomFollowUp = actions?.some(
            (a: any) => a.type === 'SCHEDULE_FOLLOW_UP',
          );
          if (!hasCustomFollowUp) {
            await this.followUpService.scheduleAutoFollowUps(
              conversationId,
              organization.id,
            );
          }
        } // end of if (existingBubbles.length === 0)

        // 2. Transmit bubbles to Meta
        for (let i = 0; i < existingBubbles.length; i++) {
          const bubble = existingBubbles[i];
          if (bubble.status === 'SENT') continue;

          // Re-check auth before each send
          const authOk = await this.deliveryAuth.authorizeDelivery(
            organizationId,
            conversationId,
            stateVersion,
          );
          if (!authOk) {
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
          if (currentConv?.aiPaused || (currentConv as any)?.lead?.optedOutAt) {
            this.logger.log(
              `AI paused or opted out mid-transmission. Aborting remaining bubbles.`,
            );
            return;
          }

          let metaMessageId: string | undefined;

          if (bubble.mediaUrl) {
            const mediaResponse = await this.whatsappService.sendMediaMessage(
              channel.credentialId!,
              organizationId,
              customerPhone,
              bubble.mediaUrl,
              bubble.content !== '[Image Sent]' ? bubble.content : undefined,
              channel.providerAccountId,
            );
            metaMessageId = mediaResponse?.messages?.[0]?.id;
          } else {
            const metaResponse = await this.whatsappService.sendTextMessage(
              channel.credentialId!,
              organizationId,
              customerPhone,
              bubble.content,
              channel.providerAccountId,
            );
            metaMessageId = metaResponse?.messages?.[0]?.id;

            // Wait 1.5-2 seconds before the next bubble to simulate typing
            if (i < existingBubbles.length - 1) {
              const delay = Math.floor(
                Math.random() * (2000 - 1500 + 1) + 1500,
              );
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }

          if (!metaMessageId) {
            throw new Error('Meta did not return a message ID for bubble ' + i);
          }

          // Update bubble status
          const updatedBubble = await this.prisma.message.update({
            where: { id: bubble.id },
            data: { metaMessageId, status: 'SENT' },
          });

          this.eventsGateway.broadcastNewMessage(organizationId, updatedBubble);

          // If this was the disclosure, update the conversation flag
          // We assume it's disclosure if it matches the buildDisclosure output or just because it's first and flag is false.
          if (
            i === 0 &&
            !currentConv?.aiDisclosureSent &&
            bubble.content.includes('digital assistant for')
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
              metadata: { messageId: metaMessageId },
            });
          }
        } // end of transmission loop

        // 3. Mark inbound messages as processed and update conversation timestamp
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });

        await this.prisma.message.updateMany({
          where: { id: { in: claimedMessageIds } },
          data: { status: 'PROCESSED' },
        });
      } catch (error) {
        this.logger.error(`Failed to generate or send AI reply: ${error}`);
        throw error;
      }
    });
  }
}
