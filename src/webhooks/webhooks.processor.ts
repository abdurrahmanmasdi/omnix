import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import type { WhatsAppWebhookPayload } from './interfaces/whatsapp.interface';
import { tenantStorage } from '../core/tenant/tenant.context';
import { WhatsappService } from './whatsapp.service';
import { EventsGateway } from '../events/events/events.gateway';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import type { SalesAgentService } from './interfaces/agent.interface';

@Processor('whatsapp-messages')
export class WebhooksProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(WebhooksProcessor.name);
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

  async process(job: Job<WhatsAppWebhookPayload>): Promise<any> {
    // Run the whole webhook worker as a "System" so it can access the database freely
    return tenantStorage.run({ isSystemBypass: true }, async () => {
      this.logger.log(`Processing background job: ${job.id}`);
      const payload = job.data;

      try {
        // Meta's webhook payload is deeply nested. We need to iterate through entries and changes.
        for (const entry of payload.entry) {
          // // The WhatsApp Business Account ID (This is what we map to metaAccountId in our DB)
          // const wabaId = entry.id;
          for (const change of entry.changes) {
            const value = change.value;
            const receivingPhoneNumberId = value.metadata.phone_number_id;

            // If there are no messages (e.g., it's just a status update like "delivered" or "read"), skip for now.
            if (!value.messages || value.messages.length === 0) continue;

            // Find which organization this WhatsApp account belongs to
            const organization = await this.prisma.organization.findUnique({
              where: { whatsappPhoneNumberId: receivingPhoneNumberId },
            });

            if (!organization) {
              this.logger.warn(
                `No organization found for Meta Account ID: ${receivingPhoneNumberId}. Dropping message.`,
              );
              continue;
            }

            // Process each incoming message
            for (const message of value.messages) {
              const customerPhone = message.from; // The user's WhatsApp number
              const metaMessageId = message.id;
              const messageContent =
                message.type === 'text' && message.text
                  ? message.text.body
                  : '[Non-text message]';

              // 1. Find or create the active conversation for this customer and organization
              let conversation = await this.prisma.conversation.findFirst({
                where: {
                  organizationId: organization.id,
                  externalContactId: customerPhone,
                },
              });

              if (!conversation) {
                // Create a new Lead and Conversation if it doesn't exist
                const newLead = await this.prisma.lead.create({
                  data: {
                    organizationId: organization.id,
                    phoneNumber: customerPhone,
                    firstName: value.contacts?.[0]?.profile?.name || 'Unknown',
                    lastName: '',
                    country: 'Unknown',
                    timezone: 'Unknown',
                    primaryLanguage: 'en', // Default, we can update via AI later
                  },
                });

                conversation = await this.prisma.conversation.create({
                  data: {
                    organizationId: organization.id,
                    externalContactId: customerPhone,
                    leadId: newLead.id,
                  },
                });
              }

              const existingMessage = await this.prisma.message.findUnique({
                where: { metaMessageId: metaMessageId },
              });

              if (existingMessage) {
                this.logger.warn(
                  `Duplicate webhook detected for Message ID: ${metaMessageId}. Terminating execution.`,
                );
                return; // Exit the job cleanly without throwing an error
              }

              // 2. Save the incoming message
              const wpMessage = await this.prisma.message.create({
                data: {
                  conversationId: conversation.id,
                  metaMessageId: metaMessageId,
                  content: messageContent,
                  type: 'LEAD_TEXT',
                  handledBy: 'HUMAN', // AI will pick this up next!
                },
              });

              this.logger.log(
                `Saved new message from ${customerPhone} for organization ${organization.name}`,
              );

              if (conversation.aiPaused) {
                this.logger.log(
                  `AI execution bypassed for conversation ${conversation.id}. State: Paused.`,
                );
                return; // Terminate execution loop. AI will not reply.
              }

              this.eventsGateway.broadcastNewMessage(
                organization.id,
                wpMessage,
              );

              // const autoReplyText = `Hello! We received your message: "${messageContent}". Our AI agent will process this shortly.`;

              if (
                organization.whatsappPhoneNumberId &&
                organization.whatsappAccessToken
              ) {
                // THE MAGIC BRIDGE: Call Python over gRPC!
                // We use lastValueFrom to convert the RxJS Observable into a standard Promise
                const aiResponse = await lastValueFrom(
                  this.salesAgentService!.generateReply({
                    organizationId: organization.id,
                    conversationId: conversation.id,
                    latestMessage: messageContent,
                  }),
                );

                const autoReplyText = aiResponse.replyText;

                // 1. Send to Meta
                const metaResponse = await this.whatsappService.sendTextMessage(
                  customerPhone,
                  organization.whatsappAccessToken,
                  organization.whatsappPhoneNumberId,
                  autoReplyText,
                );

                // 2. Save the AI's response to the database
                const aiMessage = await this.prisma.message.create({
                  data: {
                    conversationId: conversation.id,
                    content: autoReplyText,
                    // Meta returns the message ID of the message it just sent!
                    metaMessageId: metaResponse?.messages?.[0]?.id || null,
                    type: 'AI_TEXT', // Differentiate from USER_TEXT
                    handledBy: 'AI',
                  },
                });

                // 3. Update the conversation's updatedAt timestamp so it jumps to the top of the list
                await this.prisma.conversation.update({
                  where: { id: conversation.id },
                  data: { updatedAt: new Date() },
                });

                // 4. Broadcast the AI message to the frontend so the UI updates instantly
                this.eventsGateway.broadcastNewMessage(
                  organization.id,
                  aiMessage,
                );
              } else {
                this.logger.warn(
                  `Organization ${organization.id} is missing outbound WhatsApp credentials. Auto-reply skipped.`,
                );
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          this.logger.error(
            `Failed to process webhook payload: ${error.message}`,
            error.stack,
          );
        }
        throw error; // Throwing the error tells BullMQ to retry the job later based on our backoff strategy
      }
    });
  }
}
