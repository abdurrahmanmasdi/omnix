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

@Processor('ai-reply') // 🚀 Listens to the delay queue
export class AiReplyProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AiReplyProcessor.name);
  private salesAgentService: SalesAgentService | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
    private readonly eventsGateway: EventsGateway,
    private readonly actionExecutor: ActionExecutorService,
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
    }>,
  ): Promise<any> {
    return tenantStorage.run({ isSystemBypass: true }, async () => {
      const { organizationId, conversationId, customerPhone } = job.data;

      this.logger.log(
        `⏳ 7 seconds passed with no new messages. Sending Conv ${conversationId} to AI...`,
      );

      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) return;

      // Ensure the conversation wasn't manually paused by a human during the window
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      });

      if (conversation?.aiPaused) {
        this.logger.log(
          `AI was paused during the debounce window. Skipping AI reply.`,
        );
        return;
      }

      try {
        // THE MAGIC BRIDGE: Call Python over gRPC!
        const aiResponse = await lastValueFrom(
          this.salesAgentService!.generateReply({
            organizationId: organization.id,
            conversationId: conversationId,
            latestMessage:
              '[User finished typing multi-part message. Please respond to the context above.]',
          }),
        );

        const { replyText, mediaUrl, actions } = aiResponse;

        // 1. Execute Virtual Tool Actions (CRM Updates)
        if (actions && actions.length > 0) {
          await this.actionExecutor.executeActions(
            organization.id,
            conversationId,
            actions,
          );
        }

        // 2. Handle Multimodal Reply
        let metaMessageId: string | undefined = undefined;

        if (mediaUrl) {
          // If there's media, we send the image first
          const mediaResponse = await this.whatsappService.sendImageMessage(
            customerPhone,
            organization.whatsappAccessToken!,
            organization.whatsappPhoneNumberId!,
            mediaUrl,
            replyText || undefined, // Use replyText as caption if it's short/not split
          );
          metaMessageId = mediaResponse?.messages?.[0]?.id;
        } else if (replyText) {
          // Split the reply into multiple bubbles if the separator is present
          const messages = replyText
            .split('---MESSAGE_BREAK---')
            .map((m) => m.trim())
            .filter((m) => m.length > 0);

          for (let i = 0; i < messages.length; i++) {
            const message = messages[i];

            // Send to Meta
            const metaResponse = await this.whatsappService.sendTextMessage(
              customerPhone,
              organization.whatsappAccessToken!,
              organization.whatsappPhoneNumberId!,
              message,
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
              replyText || (mediaUrl ? '[Image Sent]' : '[Action Executed]'),
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
      } catch (error) {
        this.logger.error(`Failed to generate or send AI reply: ${error}`);
        throw error;
      }
    });
  }
}
