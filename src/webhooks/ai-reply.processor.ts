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

@Processor('ai-reply') // 🚀 Listens to the delay queue
export class AiReplyProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AiReplyProcessor.name);
  private salesAgentService: SalesAgentService | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
    private readonly eventsGateway: EventsGateway,
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
        `⏳ 25 seconds passed with no new messages. Sending Conv ${conversationId} to AI...`,
      );

      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) return;

      // Ensure the conversation wasn't manually paused by a human during the 25s window
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      });

      if (conversation?.aiPaused) {
        this.logger.log(
          `AI was paused during the 25s window. Skipping AI reply.`,
        );
        return;
      }

      try {
        // THE MAGIC BRIDGE: Call Python over gRPC!
        // Because Python already reads the DB to get the history, we just send a system note
        // letting Python know the user has finished their 25-second thought.
        const aiResponse = await lastValueFrom(
          this.salesAgentService!.generateReply({
            organizationId: organization.id,
            conversationId: conversationId,
            latestMessage:
              '[User finished typing multi-part message. Please respond to the context above.]',
          }),
        );

        const autoReplyText = aiResponse.replyText;

        // 1. Send to Meta
        const metaResponse = await this.whatsappService.sendTextMessage(
          customerPhone,
          organization.whatsappAccessToken!,
          organization.whatsappPhoneNumberId!,
          autoReplyText,
        );

        // 2. Save the AI's response to the database
        const aiMessage = await this.prisma.message.create({
          data: {
            conversationId: conversationId,
            content: autoReplyText,
            metaMessageId: metaResponse?.messages?.[0]?.id || null,
            type: 'AI_TEXT',
            handledBy: 'AI',
          },
        });

        // 3. Update the conversation timestamp
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });

        // 4. Broadcast the AI message to the frontend UI
        this.eventsGateway.broadcastNewMessage(organization.id, aiMessage);
      } catch (error) {
        this.logger.error(`Failed to generate or send AI reply: ${error}`);
        throw error;
      }
    });
  }
}
