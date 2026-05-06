import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import type { WhatsAppWebhookPayload } from './interfaces/whatsapp.interface';
import { tenantStorage } from '../core/tenant/tenant.context';
import { WhatsappService } from './whatsapp.service';
import { EventsGateway } from '../events/events/events.gateway';
import type { ClientGrpc } from '@nestjs/microservices';
import { InjectQueue } from '@nestjs/bullmq';
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
    @InjectQueue('ai-reply') private readonly aiReplyQueue: Queue,
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

              this.eventsGateway.broadcastNewMessage(
                organization.id,
                wpMessage,
              );

              this.logger.log(
                `Saved new message from ${customerPhone} for organization ${organization.name}`,
              );

              if (conversation.aiPaused) {
                this.logger.log(
                  `AI execution bypassed for conversation ${conversation.id}. State: Paused.`,
                );
                return; // Terminate execution loop. AI will not reply.
              }

              // const autoReplyText = `Hello! We received your message: "${messageContent}". Our AI agent will process this shortly.`;

              if (
                organization.whatsappPhoneNumberId &&
                organization.whatsappAccessToken
              ) {
                const jobId = `reply-${conversation.id}`; // Unique ID for this conversation

                // Look for an existing countdown timer. If it exists, delete it!
                const existingJob = await this.aiReplyQueue.getJob(jobId);
                if (existingJob) {
                  await existingJob.remove();
                  this.logger.log(
                    `User is typing again... Resetting 25s timer for Conv: ${conversation.id}`,
                  );
                }

                // Add a NEW 25-second timer
                await this.aiReplyQueue.add(
                  'generate-reply',
                  {
                    organizationId: organization.id,
                    conversationId: conversation.id,
                    customerPhone: customerPhone,
                  },
                  {
                    jobId: jobId, // This ensures we can find and delete it later
                    delay: 25000, // 🚀 Wait exactly 25 seconds
                    removeOnComplete: true,
                  },
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
