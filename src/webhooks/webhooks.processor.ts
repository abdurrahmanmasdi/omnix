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
import parsePhoneNumberFromString from 'libphonenumber-js';
import { NotificationEmitterService } from '../notifications/notification-emitter.service';
import { NotificationType } from '@prisma/client';
import { WhatsappMediaService } from './whatsapp-media.service';
import { FollowUpService } from '../follow-ups/follow-up.service';
import { AuditService } from '../audit/audit.service';
import { CredentialsService } from '../credentials/credentials.service';

@Processor('whatsapp-messages')
export class WebhooksProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(WebhooksProcessor.name);
  private salesAgentService: SalesAgentService | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationEmitter: NotificationEmitterService,
    private readonly whatsappService: WhatsappService,
    private readonly whatsappMediaService: WhatsappMediaService,
    private readonly eventsGateway: EventsGateway,
    private readonly followUpService: FollowUpService,
    private readonly auditService: AuditService,
    private readonly credentials: CredentialsService,
    @Inject('AI_AGENT_PACKAGE') private readonly client: ClientGrpc,
    @InjectQueue('ai-reply') private readonly aiReplyQueue: Queue,
  ) {
    super();
  }

  onModuleInit() {
    this.salesAgentService =
      this.client.getService<SalesAgentService>('SalesAgent');
  }

  // Normalized, whole-message commands. Keep this intentionally conservative:
  // ordinary uses of words such as “stop by tomorrow” must not suppress consent.
  private isOptOut(text: string): boolean {
    const normalized = text.trim().toLocaleLowerCase();
    return /^(stop|unsubscribe|cancel|end|quit|opt[ -]?out|no messages|no more messages|nicht mehr|abmelden|stopp|iptal|mesaj gönderme|mesaj gonderme|artık mesaj|artik mesaj|parar|basta|detener|cancelar)$/iu.test(
      normalized,
    );
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

            // Find the channel and its organization
            const channel = await this.prisma.channel.findFirst({
              where: {
                provider: 'WHATSAPP_CLOUD_API',
                providerAccountId: receivingPhoneNumberId,
                status: 'ACTIVE',
              },
              include: { organization: true },
            });

            const organization = channel?.organization;

            if (!organization) {
              this.logger.warn(
                `No organization found for Meta Account ID: ${receivingPhoneNumberId}. Dropping message.`,
              );
              continue;
            }

            let accessTokenForMedia: string | undefined;
            if (channel?.credentialId) {
              const activeCred = await this.credentials.readActive(
                organization.id,
                channel.credentialId,
              );
              accessTokenForMedia = activeCred.accessToken;
            }

            // Process each incoming message

            for (const message of value.messages) {
              const customerPhone = message.from; // The user's WhatsApp number
              const metaMessageId = message.id;

              // 1. Find or create the active conversation for this customer and organization
              let conversation = await this.prisma.conversation.findFirst({
                where: {
                  organizationId: organization.id,
                  externalContactId: customerPhone,
                },
                include: { lead: true },
              });

              // FIX: Even if conversation exists, ensure it has a leadId.
              // If leadId is null, we need to fix it before sending to AI.
              if (!conversation || !conversation.leadId) {
                this.logger.log(
                  `No linked lead found for inbound message. Creating/Repairing lead-conversation link...`,
                );

                // Use a transaction to ensure we don't end up with partial data
                const result = await this.prisma.$transaction(async (tx) => {
                  // Check if a lead already exists for this phone (maybe from a CSV import or previous deleted conv)
                  let lead = await tx.lead.findFirst({
                    where: {
                      organizationId: organization.id,
                      phoneNumber: customerPhone,
                      deletedAt: null,
                    },
                  });

                  if (!lead) {
                    // 1. Parse the WhatsApp Number
                    const phoneNumberObj = parsePhoneNumberFromString(
                      `+${customerPhone}`,
                    );
                    const countryCode = phoneNumberObj?.country || 'Unknown'; // e.g., 'DE', 'US', 'TR'

                    // 2. Simple EU detection for Currency
                    const euCountries = [
                      'AT',
                      'BE',
                      'BG',
                      'HR',
                      'CY',
                      'CZ',
                      'DK',
                      'EE',
                      'FI',
                      'FR',
                      'DE',
                      'GR',
                      'HU',
                      'IE',
                      'IT',
                      'LV',
                      'LT',
                      'LU',
                      'MT',
                      'NL',
                      'PL',
                      'PT',
                      'RO',
                      'SK',
                      'SI',
                      'ES',
                      'SE',
                    ];
                    const defaultCurrency = euCountries.includes(countryCode)
                      ? 'EUR'
                      : 'USD';

                    // 3. Fetch the default Pipeline Stage (Order 0)
                    const defaultPipeline =
                      await this.prisma.pipelineStage.findFirst({
                        where: { organizationId: organization.id },
                        orderBy: { orderIndex: 'asc' },
                      });

                    // 4. Create or Get the Enriched Lead using atomic upsert
                    lead = await tx.lead.upsert({
                      where: {
                        organizationId_phoneNumber: {
                          organizationId: organization.id,
                          phoneNumber: customerPhone,
                        },
                      },
                      update: {}, // Do not override existing if it was concurrently created
                      create: {
                        organizationId: organization.id,
                        phoneNumber: customerPhone,
                        firstName:
                          value.contacts?.[0]?.profile?.name || 'Unknown',
                        lastName: '',
                        country: countryCode,
                        timezone: 'Unknown',
                        primaryLanguage: 'Unknown',
                        currency: defaultCurrency,
                        status: 'NEW',
                        priority: 'COLD',
                        pipelineStageId: defaultPipeline?.id || null,
                        socialLinks: {
                          whatsapp: `https://wa.me/${customerPhone}`,
                        },
                      },
                    });
                  }

                  if (!conversation) {
                    const newConv = await tx.conversation.create({
                      data: {
                        organizationId: organization.id,
                        externalContactId: customerPhone,
                        leadId: lead.id,
                      },
                    });
                    return { ...newConv, lead };
                  } else {
                    // Repair the existing conversation by linking the lead
                    const updatedConv = await tx.conversation.update({
                      where: { id: conversation.id },
                      data: { leadId: lead.id },
                    });
                    return { ...updatedConv, lead };
                  }
                });

                conversation = result;
              }

              if (!conversation) {
                throw new Error('Conversation could not be created');
              }

              let messageContent = '[Non-text message]';
              let mediaUrl: string | null = null;

              const consentGranted = !!conversation?.lead?.mediaConsentGranted;

              if (message.type === 'text' && message.text) {
                messageContent = message.text.body;
              } else if (message.type === 'image' && message.image?.id) {
                if (consentGranted && accessTokenForMedia) {
                  const base64 =
                    await this.whatsappMediaService.downloadMediaAsBase64(
                      message.image.id,
                      accessTokenForMedia,
                    );
                  if (base64) mediaUrl = `data:image/jpeg;base64,${base64}`;
                  messageContent = '[Image message]';
                } else {
                  messageContent = '[Patient Media - Consent Required]';
                }
              } else if (
                (message.type === 'audio' && message.audio?.id) ||
                (message.type === 'voice' && message.voice?.id)
              ) {
                const audioId = message.audio?.id || message.voice?.id;
                if (consentGranted && accessTokenForMedia && audioId) {
                  const base64 =
                    await this.whatsappMediaService.downloadMediaAsBase64(
                      audioId,
                      accessTokenForMedia,
                    );
                  if (base64) mediaUrl = `data:audio/ogg;base64,${base64}`;
                  messageContent = '[Audio message]';
                } else {
                  messageContent = '[Patient Media - Consent Required]';
                }
              }

              const existingMessage = await this.prisma.message.findUnique({
                where: { metaMessageId: metaMessageId },
              });

              if (existingMessage) {
                this.logger.warn(
                  `Duplicate webhook detected for Message ID: ${metaMessageId}. Terminating execution.`,
                );
                continue; // A batch can contain other, non-duplicate messages.
              }

              // 2. Save the incoming message
              let wpMessage;
              try {
                // metaMessageId is unique in the database. This catch closes the
                // check/create race between simultaneous BullMQ workers.
                wpMessage = await this.prisma.message.create({
                  data: {
                    conversationId: conversation.id,
                    metaMessageId: metaMessageId,
                    content: messageContent,
                    mediaUrl: mediaUrl,
                    type: 'LEAD_TEXT',
                    handledBy: 'HUMAN',
                  },
                });
              } catch (error: any) {
                if (error?.code === 'P2002') {
                  this.logger.warn(
                    `Duplicate inbound message ${metaMessageId} rejected atomically.`,
                  );
                  continue;
                }
                throw error;
              }

              void this.eventsGateway.broadcastNewMessage(
                organization.id,
                wpMessage,
              );

              await this.followUpService.cancelPendingFollowUps(
                conversation.id,
              );

              if (
                messageContent.trim().toUpperCase() === 'I CONSENT' &&
                conversation.leadId
              ) {
                await (this.prisma.lead as any).update({
                  where: { id: conversation.leadId },
                  data: {
                    mediaConsentGranted: true,
                    mediaConsentGrantedAt: new Date(),
                    mediaConsentSource: 'patient_message',
                    mediaConsentWithdrawnAt: null,
                  },
                });
                this.logger.log(
                  `Media consent granted by Conv: ${conversation.id}`,
                );
              } else if (
                messageContent.trim().toUpperCase() === 'WITHDRAW CONSENT' &&
                conversation.leadId
              ) {
                await (this.prisma.lead as any).update({
                  where: { id: conversation.leadId },
                  data: {
                    mediaConsentGranted: false,
                    mediaConsentWithdrawnAt: new Date(),
                    mediaConsentSource: 'patient_message',
                  },
                });

                // Clear mediaUrls for existing messages
                await this.prisma.message.updateMany({
                  where: {
                    conversationId: conversation.id,
                    mediaUrl: { not: null },
                  },
                  data: {
                    mediaUrl: null,
                    content: '[Media removed due to privacy rules]',
                  },
                });
                this.logger.log(
                  `Media consent withdrawn by Conv: ${conversation.id}`,
                );
              }

              if (this.isOptOut(messageContent)) {
                // Consent is stored on the tenant-owned lead, not globally by
                // phone number. This prevents one tenant's STOP from affecting
                // another tenant that happens to know the same contact.
                await this.prisma.$transaction([
                  (this.prisma.lead as any).updateMany({
                    where: {
                      organizationId: organization.id,
                      phoneNumber: customerPhone,
                      deletedAt: null,
                    },
                    data: {
                      optedOutAt: new Date(),
                      optOutReason: messageContent,
                    },
                  }),
                  this.prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { aiPaused: true },
                  }),
                ]);
                await this.auditService.record({
                  organizationId: organization.id,
                  action: 'consent.opt_out',
                  targetId: conversation.leadId ?? undefined,
                  actor: 'webhook:whatsapp',
                  metadata: {
                    sourceMessageId: metaMessageId,
                    reason: messageContent,
                  },
                });
                const pendingReply = await this.aiReplyQueue.getJob(
                  `reply-${conversation.id}`,
                );
                if (pendingReply) await pendingReply.remove();
                this.logger.log(
                  `Recorded opt-out for tenant ${organization.id}, contact [REDACTED].`,
                );
                continue;
              }

              const leadConsent = await (this.prisma.lead as any).findFirst({
                where: {
                  organizationId: organization.id,
                  phoneNumber: customerPhone,
                  deletedAt: null,
                },
                select: { optedOutAt: true },
              });
              if (leadConsent?.optedOutAt) {
                this.logger.log(
                  `Outbound automation suppressed for opted-out contact.`,
                );
                continue;
              }

              this.logger.log(
                `Saved new message for organization ${organization.name}`,
              );

              if (conversation.aiPaused) {
                const lead = await this.prisma.lead.findFirst({
                  where: {
                    organizationId: organization.id,
                    phoneNumber: customerPhone,
                    deletedAt: null,
                  },
                });

                if (conversation.assignedAgentId) {
                  await this.notificationEmitter.send({
                    organizationId: conversation.organizationId,
                    userId: conversation.assignedAgentId, // Route directly to the human who owns this conversation
                    type: NotificationType.NEW_MESSAGE,
                    title: `New Message from ${`${lead?.firstName || ''} ${lead?.lastName || ''}`}`,
                    body:
                      wpMessage.content.length > 50
                        ? `${wpMessage.content.substring(0, 50)}...`
                        : wpMessage.content,
                    referenceId: conversation.id,
                    referenceType: 'CONVERSATION',
                  });
                }

                this.logger.log(
                  `AI execution bypassed for conversation ${conversation.id}. State: Paused.`,
                );
                return; // Terminate execution loop. AI will not reply.
              }

              // const autoReplyText = `Hello! We received your message: "${messageContent}". Our AI agent will process this shortly.`;

              if (channel) {
                const jobId = `reply-${conversation.id}`; // Unique ID for this conversation

                // Look for an existing countdown timer
                const existingJob = await this.aiReplyQueue.getJob(jobId);
                let newMessageIds: string[] = [wpMessage.id];

                if (existingJob) {
                  // Merge message IDs from the existing job
                  if (
                    existingJob.data &&
                    Array.isArray(existingJob.data.newMessageIds)
                  ) {
                    newMessageIds = [
                      ...existingJob.data.newMessageIds,
                      wpMessage.id,
                    ];
                  }
                  await existingJob.remove();
                  this.logger.log(
                    `User is typing again... Resetting 25s timer for Conv: ${conversation.id}. Merged ${newMessageIds.length} messages.`,
                  );
                }

                // Add a NEW 25-second timer
                await this.aiReplyQueue.add(
                  'generate-reply',
                  {
                    organizationId: organization.id,
                    conversationId: conversation.id,
                    customerPhone: customerPhone,
                    newMessageIds: newMessageIds, // 🚀 NEW: Pass the array of IDs instead of inline media/text
                  },
                  {
                    jobId: jobId, // This ensures we can find and delete it later
                    delay: 7000, // Wait exactly 7 seconds
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
