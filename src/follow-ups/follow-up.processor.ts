import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { tenantStorage } from '../core/tenant/tenant.context';
import {
  FollowUpStatus,
  FollowUpType,
  NotificationType,
  LeadStatus,
} from '@prisma/client';
import { WhatsappService } from '../webhooks/whatsapp.service';
import { EventsGateway } from '../events/events/events.gateway';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import type { SalesAgentService } from '../webhooks/interfaces/agent.interface';
import { ActionExecutorService } from '../webhooks/action-executor.service';
import { NotificationEmitterService } from '../notifications/notification-emitter.service';
import { DeliveryAuthService } from '../webhooks/delivery-auth.service';

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
        type: 'SYSTEM' as any,
        handledBy: 'SYSTEM' as any,
      },
    });
    this.eventsGateway.broadcastNewMessage(organizationId, sysMsg);
  }

  async process(job: Job<{ followUpId: string }>): Promise<any> {
    return tenantStorage.run({ isSystemBypass: true }, async () => {
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

      const conversation = followUp.conversation;
      const organization = followUp.organization;

      if (conversation.aiPaused || (conversation as any).lead?.optedOutAt) {
        this.logger.log(
          `Conversation ${conversation.id} is paused or opted out. Cancelling follow-up.`,
        );
        await this.prisma.scheduledFollowUp.update({
          where: { id: followUp.id },
          data: {
            status: FollowUpStatus.CANCELLED,
            cancelReason: (conversation as any).lead?.optedOutAt
              ? 'Consent withdrawn'
              : 'AI Paused',
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
          const memberships = await this.prisma.organizationMembership.findMany(
            {
              where: { organizationId: organization.id },
            },
          );

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

        if (replyText && replyText.includes('[SYSTEM: DO_NOT_SEND_REPLY]')) {
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

        let metaMessageId: string | undefined = undefined;

        await this.prisma.message.update({
          where: { idempotencyKey: `followUp-${followUp.id}` },
          data: {
            content:
              replyText || (mediaUrl ? '[Image Sent]' : '[Action Executed]'),
            mediaUrl: mediaUrl || null,
          },
        });

        if (mediaUrl) {
          const authOk = await this.deliveryAuth.authorizeDelivery(
            organization.id,
            conversation.id,
          );
          if (!authOk) {
            this.logger.warn(
              `Follow-up delivery aborted for media (Org: ${organization.id}, Conv: ${conversation.id})`,
            );
            await this.recordCancellation(
              conversation.id,
              organization.id,
              'Follow-up aborted prior to media send due to authorization failure.',
            );
            return;
          }
          const mediaResponse = await this.whatsappService.sendMediaMessage(
            channel.credentialId,
            organization.id,
            conversation.externalContactId!,
            mediaUrl,
            replyText || undefined,
            channel.providerAccountId,
          );
          metaMessageId = mediaResponse?.messages?.[0]?.id;
        } else if (replyText) {
          const messages = replyText
            .split('|||')
            .map((m) => m.trim())
            .filter((m) => m.length > 0);
          for (let i = 0; i < messages.length; i++) {
            const message = messages[i];

            const authOk = await this.deliveryAuth.authorizeDelivery(
              organization.id,
              conversation.id,
            );
            if (!authOk) {
              this.logger.warn(
                `Follow-up delivery aborted for text (Org: ${organization.id}, Conv: ${conversation.id})`,
              );
              await this.recordCancellation(
                conversation.id,
                organization.id,
                'Follow-up aborted prior to text send due to authorization failure.',
              );
              return;
            }
            const metaResponse = await this.whatsappService.sendTextMessage(
              channel.credentialId,
              organization.id,
              conversation.externalContactId!,
              message,
              channel.providerAccountId,
            );
            metaMessageId = metaResponse?.messages?.[0]?.id;
            if (i < messages.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
          }
        }

        if (metaMessageId || actions?.length) {
          // Save the message
          const aiMessage = await this.prisma.message.create({
            data: {
              conversationId: conversation.id,
              content:
                replyText || (mediaUrl ? '[Image Sent]' : '[Action Executed]'),
              mediaUrl: mediaUrl || null,
              metaMessageId: metaMessageId ?? null,
              type: 'AI_TEXT',
              handledBy: 'AI',
            },
          });

          await this.prisma.conversation.update({
            where: { id: conversation.id },
            data: { updatedAt: new Date() },
          });

          this.eventsGateway.broadcastNewMessage(organization.id, aiMessage);

          // Mark as sent
          await this.prisma.scheduledFollowUp.update({
            where: { id: followUp.id },
            data: { status: FollowUpStatus.SENT, sentAt: new Date() },
          });
        }
      } catch (error) {
        this.logger.error(`Failed to process follow-up: ${error}`);
        throw error;
      }
    });
  }
}
