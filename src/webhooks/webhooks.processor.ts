import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import type { WhatsAppWebhookPayload } from './interfaces/whatsapp.interface';
import { tenantStorage } from '../core/tenant/tenant.context';
import { WhatsappService } from './whatsapp.service';
import { EventsGateway } from '../events/events/events.gateway';
import { GrpcClientService } from '../grpc-client/grpc-client.service';
import parsePhoneNumberFromString from 'libphonenumber-js';
import { NotificationEmitterService } from '../notifications/notification-emitter.service';
import { Lead, Message, NotificationType, Prisma } from '@prisma/client';
import {
  WhatsappMediaService,
  patientMediaExpiry,
} from './whatsapp-media.service';
import { FollowUpService } from '../follow-ups/follow-up.service';
import { AuditService } from '../audit/audit.service';
import { CredentialsService } from '../credentials/credentials.service';
import { OutboundAttemptService } from './outbound-attempt.service';
import { mediaConsentRequestText, patientLanguage } from './patient-copy';

const CONSENT_REQUEST_PREFIX = 'consent-request-';

type PatientCommand = 'STOP' | 'START' | 'I_CONSENT' | 'WITHDRAW_CONSENT';

@Processor('whatsapp-messages')
export class WebhooksProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhooksProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationEmitter: NotificationEmitterService,
    private readonly whatsappService: WhatsappService,
    private readonly whatsappMediaService: WhatsappMediaService,
    private readonly eventsGateway: EventsGateway,
    private readonly followUpService: FollowUpService,
    private readonly auditService: AuditService,
    private readonly credentials: CredentialsService,
    private readonly outboundAttempts: OutboundAttemptService,
    private readonly grpcClient: GrpcClientService,
  ) {
    super();
  }

  // Normalized, whole-message commands. Keep this intentionally conservative:
  // ordinary uses of words such as “stop by tomorrow” must not suppress consent.
  private isOptOut(text: string): boolean {
    const normalized = text.trim().toLocaleLowerCase();
    return /^(stop|unsubscribe|cancel|end|quit|opt[ -]?out|no messages|no more messages|nicht mehr|abmelden|stopp|iptal|mesaj gönderme|mesaj gonderme|artık mesaj|artik mesaj|parar|basta|detener|cancelar)$/iu.test(
      normalized,
    );
  }

  // Only an explicit re-opt-in clears a STOP; an ordinary new message does not.
  private isOptIn(text: string): boolean {
    return /^(start|başla|basla)$/u.test(text.trim().toLowerCase());
  }

  private patientCommand(text: string): PatientCommand | null {
    if (this.isOptOut(text)) return 'STOP';
    if (this.isOptIn(text)) return 'START';
    const upper = text.trim().toUpperCase();
    if (upper === 'I CONSENT') return 'I_CONSENT';
    if (upper === 'WITHDRAW CONSENT') return 'WITHDRAW_CONSENT';
    return null;
  }

  /**
   * Applies a patient command inside the inbound message transaction, so the
   * effect commits exactly when the message does (KI-022). Audit rows carry
   * the source message id, never the patient text.
   */
  private async applyPatientCommand(
    tx: Prisma.TransactionClient,
    command: PatientCommand,
    context: {
      organizationId: string;
      conversationId: string;
      leadId: string | null;
      customerPhone: string;
      metaMessageId: string;
    },
  ) {
    const { organizationId, conversationId, leadId, metaMessageId } = context;
    const audit = (action: string) =>
      tx.auditLog.create({
        data: {
          organizationId,
          action,
          targetId: leadId ?? conversationId,
          actor: 'webhook:whatsapp',
          metadata: { sourceMessageId: metaMessageId },
        },
      });
    // Consent is stored on the tenant-owned lead, not globally by phone
    // number. One tenant's STOP must not affect another tenant.
    const tenantLead = {
      organizationId,
      deletedAt: null,
      OR: [
        ...(leadId ? [{ id: leadId }] : []),
        { phoneNumber: context.customerPhone },
      ],
    };
    switch (command) {
      case 'STOP':
        await tx.lead.updateMany({
          where: tenantLead,
          data: {
            optedOutAt: new Date(),
            optOutReason: 'PATIENT_STOP_COMMAND',
          },
        });
        await audit('consent.opt_out');
        return;
      case 'START':
        await tx.lead.updateMany({
          where: { ...tenantLead, optedOutAt: { not: null } },
          data: { optedOutAt: null, optOutReason: null },
        });
        await audit('consent.opt_in');
        return;
      case 'I_CONSENT':
        if (!leadId) return;
        await tx.lead.update({
          where: { id: leadId },
          data: {
            mediaConsentGranted: true,
            mediaConsentGrantedAt: new Date(),
            mediaConsentSource: 'patient_message',
            mediaConsentWithdrawnAt: null,
            mediaConsentPurpose: 'Patient Media Analysis v1.0',
            mediaConsentText: 'I CONSENT',
            mediaConsentResponseId: metaMessageId,
            mediaConsentChannel: 'whatsapp',
          },
        });
        await audit('consent.media_granted');
        return;
      case 'WITHDRAW_CONSENT':
        if (!leadId) return;
        await tx.lead.update({
          where: { id: leadId },
          data: {
            mediaConsentGranted: false,
            mediaConsentWithdrawnAt: new Date(),
            mediaConsentSource: 'patient_message',
            mediaConsentPurpose: null,
          },
        });
        // Clear stored media for this conversation in the same commit.
        await tx.message.updateMany({
          where: { conversationId, mediaUrl: { not: null } },
          data: {
            mediaUrl: null,
            content: '[Media removed due to privacy rules]',
          },
        });
        await audit('consent.media_withdrawn');
        return;
    }
  }

  private async consentRequestText(
    clinicName: string,
    conversationId: string,
    lead: Pick<Lead, 'preferredLanguage' | 'primaryLanguage'> | null,
  ) {
    const recent = await this.prisma.message.findMany({
      where: { conversationId, type: 'LEAD_TEXT' },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { content: true },
    });
    return mediaConsentRequestText(
      clinicName,
      patientLanguage(
        lead,
        recent.map((row) => row.content),
      ),
    );
  }

  /**
   * At most one media-consent request per conversation per 24 h (KI-025).
   * Created with the inbound message, so a duplicate webhook creates none.
   */
  private async createConsentRequest(
    tx: Prisma.TransactionClient,
    conversationId: string,
    metaMessageId: string,
    content: string,
    version: number,
  ): Promise<Message | null> {
    const recent = await tx.message.count({
      where: {
        conversationId,
        idempotencyKey: { startsWith: CONSENT_REQUEST_PREFIX },
        status: { not: 'CANCELLED' },
        createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (recent > 0) return null;
    return tx.message.create({
      data: {
        conversationId,
        content,
        type: 'AI_TEXT',
        handledBy: 'AI',
        status: 'PENDING',
        idempotencyKey: `${CONSENT_REQUEST_PREFIX}${metaMessageId}`,
        metadata: { kind: 'MEDIA_CONSENT_REQUEST', generationVersion: version },
      },
    });
  }

  private async sendConsentRequest(
    organizationId: string,
    request: Message,
    version: number,
  ) {
    const result = await this.outboundAttempts.sendBubble(
      organizationId,
      request.conversationId,
      request,
      version,
      'consent-request',
    );
    if (result === 'WAITING') throw new Error('OUTBOUND_UNRESOLVED');
    if (result === 'ACCEPTED') {
      const sent = await this.prisma.message.findUnique({
        where: { id: request.id },
      });
      if (sent)
        void this.eventsGateway.broadcastNewMessage(organizationId, sent);
    }
  }

  private async resumeConsentRequest(
    organizationId: string,
    conversationId: string,
    metaMessageId: string,
  ) {
    const request = await this.prisma.message.findUnique({
      where: { idempotencyKey: `${CONSENT_REQUEST_PREFIX}${metaMessageId}` },
    });
    if (
      !request ||
      request.conversationId !== conversationId ||
      request.status !== 'PENDING'
    )
      return;
    const version =
      (request.metadata as { generationVersion?: number } | null)
        ?.generationVersion ?? 0;
    await this.sendConsentRequest(organizationId, request, version);
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

            // Find the channel and its organization
            const matchingChannels = await this.prisma.channel.findMany({
              where: {
                provider: 'WHATSAPP_CLOUD_API',
                providerAccountId: receivingPhoneNumberId,
              },
              include: { organization: true },
              take: 2,
            });
            if (matchingChannels.length !== 1) {
              this.logger.warn(
                'Webhook channel routing is missing or ambiguous.',
              );
              continue;
            }
            const channel = matchingChannels[0];

            const organization = channel?.organization;

            if (!organization) {
              this.logger.warn('Webhook organization lookup failed.');
              continue;
            }

            for (const status of value.statuses ?? []) {
              if (
                status.id &&
                ['sent', 'delivered', 'read', 'failed'].includes(status.status)
              ) {
                await this.outboundAttempts.reconcileStatus(
                  organization.id,
                  status.id,
                  status.status,
                  status.biz_opaque_callback_data,
                );
              }
            }
            if (!value.messages || value.messages.length === 0) continue;
            if (channel.status !== 'ACTIVE') continue;

            let accessTokenForMedia: string | undefined;
            if (channel?.credentialId) {
              const activeCred = await this.credentials.readActive(
                organization.id,
                channel.credentialId,
              );
              accessTokenForMedia =
                activeCred.metaAccessToken || activeCred.accessToken;
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
                        channelId: channel.id,
                      },
                    });
                    return { ...newConv, lead };
                  } else {
                    // Repair the existing conversation by linking the lead
                    const updatedConv = await tx.conversation.update({
                      where: { id: conversation.id },
                      data: { leadId: lead.id, channelId: channel.id },
                    });
                    return { ...updatedConv, lead };
                  }
                });

                conversation = result;
              }

              if (!conversation) {
                throw new Error('Conversation could not be created');
              }

              // Duplicate check before any media download or patient-facing
              // send (R2). A replay only resumes an unsent consent request.
              const existingMessage = await this.prisma.message.findUnique({
                where: { metaMessageId: metaMessageId },
              });

              if (existingMessage) {
                this.logger.warn(`INBOUND_DUPLICATE jobId=${job.id}`);
                await this.resumeConsentRequest(
                  organization.id,
                  conversation.id,
                  metaMessageId,
                );
                continue; // A batch can contain other, non-duplicate messages.
              }

              let messageContent = '[Non-text message]';
              let mediaUrl: string | null = null;
              let awaitingConsent = false;

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
                  awaitingConsent = true;
                  messageContent = '[Media omitted: Awaiting consent.]';
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
                  awaitingConsent = true;
                  messageContent = '[Media omitted: Awaiting consent.]';
                }
              }

              // 2. Save the inbound message, its command effects (STOP, START,
              // I CONSENT, WITHDRAW CONSENT) and the durable reply intent in
              // one transaction. A crash after commit followed by a retry is
              // skipped as a duplicate, so effects committed separately could
              // be lost for good (KI-022).
              let wpMessage;
              const command = this.patientCommand(messageContent);
              const isStop = command === 'STOP';
              const shouldGenerate =
                !isStop &&
                !conversation.aiPaused &&
                !conversation.lead?.optedOutAt &&
                organization.isActive &&
                !organization.deleted_at &&
                channel.status === 'ACTIVE';
              const leadId = conversation.leadId;
              const consentRequestText =
                awaitingConsent &&
                !conversation.aiPaused &&
                !conversation.lead?.optedOutAt
                  ? await this.consentRequestText(
                      organization.name,
                      conversation.id,
                      conversation.lead,
                    )
                  : null;
              let consentRequest: Message | null = null;
              let consentVersion = 0;
              try {
                // metaMessageId is unique in the database. This catch closes the
                // check/create race between simultaneous BullMQ workers.
                wpMessage = await this.prisma.$transaction(async (tx) => {
                  const saved = await tx.message.create({
                    data: {
                      conversationId: conversation.id,
                      metaMessageId,
                      content: messageContent,
                      mediaUrl,
                      // Retention for patient media (KI-026); the daily
                      // cleanup removes the content and keeps a marker.
                      mediaExpiresAt: mediaUrl ? patientMediaExpiry() : null,
                      type:
                        message.type === 'text' ? 'LEAD_TEXT' : 'LEAD_MEDIA',
                      handledBy: 'HUMAN',
                      status: shouldGenerate ? 'PENDING' : 'PROCESSED',
                    },
                  });
                  // Every inbound arrival invalidates a reply based on older
                  // conversation history, including STOP during generation.
                  const currentConversation = await tx.conversation.update({
                    where: { id: conversation.id },
                    data: {
                      stateVersion: { increment: 1 },
                      ...(isStop ? { aiPaused: true } : {}),
                      ...(!conversation.channelId
                        ? { channelId: channel.id }
                        : {}),
                    },
                    select: { stateVersion: true },
                  });
                  await tx.scheduledFollowUp.updateMany({
                    where: {
                      conversationId: conversation.id,
                      status: 'PENDING',
                    },
                    data: {
                      status: 'CANCELLED',
                      cancelledAt: new Date(),
                      cancelReason: 'Customer responded',
                    },
                  });
                  if (leadId) {
                    await tx.lead.update({
                      where: { id: leadId },
                      data: { nextFollowUpAt: null },
                    });
                  }
                  if (command) {
                    await this.applyPatientCommand(tx, command, {
                      organizationId: organization.id,
                      conversationId: conversation.id,
                      leadId,
                      customerPhone,
                      metaMessageId,
                    });
                  }
                  if (consentRequestText) {
                    consentVersion = currentConversation.stateVersion;
                    consentRequest = await this.createConsentRequest(
                      tx,
                      conversation.id,
                      metaMessageId,
                      consentRequestText,
                      consentVersion,
                    );
                  }
                  if (shouldGenerate) {
                    await tx.outboxEvent.create({
                      data: {
                        organizationId: organization.id,
                        topic: 'generate-reply',
                        payload: {
                          organizationId: organization.id,
                          conversationId: conversation.id,
                          messageId: saved.id,
                          stateVersion: currentConversation.stateVersion,
                        },
                      },
                    });
                  }
                  return saved;
                });
              } catch (error: any) {
                if (error?.code === 'P2002') {
                  this.logger.warn(`INBOUND_DUPLICATE jobId=${job.id}`);
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

              if (consentRequest) {
                await this.sendConsentRequest(
                  organization.id,
                  consentRequest,
                  consentVersion,
                );
              }

              if (isStop) {
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
                `INBOUND_SAVED conversationId=${conversation.id}`,
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
                continue; // Keep processing other messages in the webhook batch.
              }

              // const autoReplyText = `Hello! We received your message: "${messageContent}". Our AI agent will process this shortly.`;

              // The outbox relay owns scheduling. A Redis failure after this
              // point cannot lose the committed inbound message.
            }
          }
        }
      } catch (error) {
        this.logger.error(`WEBHOOK_PROCESS_FAILED jobId=${job.id}`);
        throw error; // Throwing the error tells BullMQ to retry the job later based on our backoff strategy
      }
    });
  }
}
