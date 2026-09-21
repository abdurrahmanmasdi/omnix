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
    const fallback = "Hi {{firstName}}! 👋 I'm {{agentName}}, the digital assistant for {{clinicName}}. I'm an AI, not a doctor, but I'm here to help you with info about our services, pricing, and booking. If you ever need a human medical coordinator, just say 'human' and I'll connect you right away. How can I help you today?";
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
    @Inject('AI_AGENT_PACKAGE') private readonly client: ClientGrpc,
  ) {
    super();
  }

  onModuleInit() {
    this.salesAgentService =
      this.client.getService<SalesAgentService>('SalesAgent');
  }

  async process(
    job: Job<{
      organizationId: string;
      conversationId: string;
      customerPhone: string;
      latestMetaMessageId?: string;
      imageBase64?: string;
      audioBase64?: string;
    }>,
  ): Promise<any> {
    return tenantStorage.run({ isSystemBypass: true }, async () => {
      const {
        organizationId,
        conversationId,
        customerPhone,
        latestMetaMessageId,
        imageBase64,
        audioBase64,
      } = job.data;

      this.logger.log(
        `⏳ 7 seconds passed with no new messages. Sending Conv ${conversationId} to AI...`,
      );

      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        include: { aiPersona: true },
      });

      if (!organization) return;

      // 🚀 NEW: Get active WhatsApp channel
      const channel = await this.prisma.channel.findFirst({
        where: {
          organizationId,
          provider: 'WHATSAPP_CLOUD_API',
          status: 'ACTIVE',
        },
      });

      // Ensure the conversation wasn't manually paused by a human during the window
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { lead: true },
      });

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
        // The disclosure is its own delivered message so an AI service failure cannot
        // accidentally mark a conversation as disclosed. The flag changes only after
        // Meta acknowledges successful delivery.
        let disclosureText: string | undefined;
        if (!conversation.aiDisclosureSent && channel?.credentialId) {
          disclosureText = this.buildDisclosure(
            organization.aiPersona?.aiDisclosureText,
            conversation.lead?.firstName,
            organization.aiPersona?.agentName,
            organization.aiPersona?.clinicName,
          );
          const disclosureResponse = await this.whatsappService.sendTextMessage(
            channel.credentialId,
            organizationId,
            customerPhone,
            disclosureText,
            channel.providerAccountId,
          );
          if (!disclosureResponse?.messages?.[0]?.id) {
            throw new Error('AI disclosure was not acknowledged by WhatsApp');
          }
          await this.prisma.conversation.update({
            where: { id: conversationId },
            data: { aiDisclosureSent: true },
          });
          await this.auditService.record({
            organizationId: conversation.organizationId,
            action: 'ai.disclosure_sent',
            targetId: conversation.id,
            actor: 'ai',
            metadata: { messageId: disclosureResponse.messages[0].id },
          });
        }
        // 🚀 NEW: Simulate Typing Indicator on WhatsApp
        if (
          latestMetaMessageId &&
          channel?.credentialId
        ) {
          try {
            await this.whatsappService.sendTypingIndicator(
              channel.credentialId,
              organizationId,
              latestMetaMessageId,
            );
          } catch (e: any) {
            this.logger.warn(
              `Typing indicator failed (likely API version mismatch or expired msg): ${e.message}`,
            );
          }
        }

        const persona = organization.aiPersona;
        const businessRulesJson = persona?.businessRules ? JSON.stringify(persona.businessRules) : '{}';

        // THE MAGIC BRIDGE: Call Python over gRPC!
        const aiResponse = await lastValueFrom(
          this.salesAgentService!.generateReply({
            organizationId: organization.id,
            conversationId: conversationId,
            latestMessage:
              '[User finished typing multi-part message. Please respond to the context above.]',
            clinicName: persona?.clinicName || 'OmniDesk Clinic',
            agentTone: persona?.tone || 'Professional and empathetic',
            businessRulesJson: businessRulesJson,
            imageBase64: imageBase64,
            audioBase64: audioBase64,
            totalMessageCount: totalMessageCount,
            leadSummary: leadSummary,
          }),
        );

        const { replyText, mediaUrl, actions } = aiResponse;

        // 1. Execute Virtual Tool Actions (CRM Updates)
        if (actions && actions.length > 0) {
          const actionResult = await this.actionExecutor.executeActions(
            organization.id,
            conversationId,
            actions,
          );
          if (actionResult.failed > 0) {
            throw new Error(`Critical action execution failure (${actionResult.failed} failed), aborting reply delivery to prevent inconsistency`);
          }
        }

        if (replyText && replyText.includes('[SYSTEM: DO_NOT_SEND_REPLY]')) {
          this.logger.log('AI requested to sleep. Aborting WhatsApp message delivery.');
          return; // Stop execution here, do not send anything to WhatsApp
        }

        // 2. Handle Multimodal Reply
        let metaMessageId: string | undefined = undefined;

        if (mediaUrl && channel?.credentialId) {
          // If there's media, we send the image first
          const mediaResponse = await this.whatsappService.sendMediaMessage(
            channel.credentialId,
            organizationId,
            customerPhone,
            mediaUrl,
            replyText || undefined, // Use replyText as caption if it's short/not split
            channel.providerAccountId,
          );
          metaMessageId = mediaResponse?.messages?.[0]?.id;
        } else if (replyText && channel?.credentialId) {
          // Split the reply into multiple bubbles if the separator is present
          const messages = replyText
            .split('|||')
            .map((m) => m.trim())
            .filter((m) => m.length > 0);

          for (let i = 0; i < messages.length; i++) {
            const message = messages[i];

            // Send to Meta
            const metaResponse = await this.whatsappService.sendTextMessage(
              channel.credentialId,
              organizationId,
              customerPhone,
              message,
              channel.providerAccountId,
            );

            // We use the ID of the last message in the sequence for our DB record
            metaMessageId = metaResponse?.messages?.[0]?.id;

            // If there's another message coming, wait 1.5 - 2 seconds to simulate typing
            if (i < messages.length - 1) {
              const delay = Math.floor(
                Math.random() * (2000 - 1500 + 1) + 1500,
              );
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
        }

        if (!metaMessageId && !actions?.length) {
          this.logger.warn(
            `AI returned empty reply and no actions for Conv: ${conversationId}`,
          );
          return;
        }

        // 3. Save the AI's response to the database
        const aiMessage = await this.prisma.message.create({
          data: {
            conversationId: conversationId,
            content:
              [disclosureText, replyText || (mediaUrl ? '[Image Sent]' : '[Action Executed]')]
                .filter(Boolean)
                .join('|||'),
            mediaUrl: mediaUrl || null,
            metaMessageId: metaMessageId ?? null,
            type: 'AI_TEXT',
            handledBy: 'AI',
          },
        });

        // 4. Update the conversation timestamp
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });

        // 5. Broadcast the AI message to the frontend UI
        this.eventsGateway.broadcastNewMessage(organization.id, aiMessage);

        // 6. Schedule auto follow-ups
        await this.followUpService.scheduleAutoFollowUps(conversationId, organization.id);
      } catch (error) {
        this.logger.error(`Failed to generate or send AI reply: ${error}`);
        throw error;
      }
    });
  }
}
