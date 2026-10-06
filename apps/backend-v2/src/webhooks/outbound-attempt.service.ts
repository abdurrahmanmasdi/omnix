import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Message, Prisma } from '@prisma/client';
import { alertConversationStaff } from '../notifications/conversation-staff-alert';
import { PrismaService } from '../prisma/prisma.service';
import { tenantStorage } from '../core/tenant/tenant.context';
import { DeliveryAuthService } from './delivery-auth.service';
import { OutboundNotSentError, WhatsappService } from './whatsapp.service';

export type AttemptResult = 'ACCEPTED' | 'WAITING' | 'FAILED' | 'CANCELLED';

/**
 * reply / follow-up: AI-generated bubbles, blocked by pause, assignment and a
 * newer conversation version. staff: a human reply, allowed while the AI is
 * paused and after a STOP (D-021: warning only); still needs clinic, channel
 * and 24 h checks.
 * consent-request: the system media-consent prompt; blocked by pause and
 * opt-out, not by a newer inbound or by staff assignment.
 */
export type OutboundPurpose =
  | 'reply'
  | 'follow-up'
  | 'staff'
  | 'consent-request';

export type DeliveryBlockReason =
  | 'CONVERSATION_NOT_FOUND'
  | 'PATIENT_OPTED_OUT'
  | 'CLINIC_INACTIVE'
  | 'CHANNEL_UNAVAILABLE'
  | 'NO_CONTACT'
  | 'OUTSIDE_24H_WINDOW';

const PURPOSES: OutboundPurpose[] = [
  'reply',
  'follow-up',
  'staff',
  'consent-request',
];
const AI_GENERATED: OutboundPurpose[] = ['reply', 'follow-up'];

@Injectable()
export class OutboundAttemptService {
  private readonly logger = new Logger(OutboundAttemptService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: DeliveryAuthService,
    private readonly whatsapp: WhatsappService,
  ) {}

  /**
   * Checks shared by every patient-facing send (R8): opt-out (automated
   * purposes only, D-021), clinic, channel/credential, recipient, and the
   * WhatsApp 24 h free-form window.
   */
  async checkEligibility(
    organizationId: string,
    conversationId: string,
    purpose: OutboundPurpose,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, organizationId, deletedAt: null },
      include: { channel: true, lead: true, organization: true },
    });
    const block = (reason: DeliveryBlockReason) =>
      ({ ok: false, reason }) as const;
    if (!conversation) return block('CONVERSATION_NOT_FOUND');
    // A STOP stops automation, never people (D-021): staff sends to an
    // opted-out patient go out and carry a warning instead.
    const patientOptedOut = !!conversation.lead?.optedOutAt;
    if (patientOptedOut && purpose !== 'staff')
      return block('PATIENT_OPTED_OUT');
    if (
      !conversation.organization.isActive ||
      conversation.organization.deleted_at
    )
      return block('CLINIC_INACTIVE');
    const channel = conversation.channel;
    if (
      !channel ||
      channel.organizationId !== organizationId ||
      channel.status !== 'ACTIVE' ||
      !channel.credentialId ||
      !channel.providerAccountId
    )
      return block('CHANNEL_UNAVAILABLE');
    if (!conversation.externalContactId) return block('NO_CONTACT');
    // Meta allows free-form text/media only within 24 hours of the most
    // recent customer message. No approved template is configured here.
    const channelMetadata = channel.metadata as Prisma.JsonObject | null;
    const onboardingAt =
      channelMetadata?.coexistence &&
      typeof channelMetadata.onboardingAt === 'string'
        ? Date.parse(channelMetadata.onboardingAt)
        : 0;
    const windowStart = Math.max(
      Date.now() - 24 * 60 * 60 * 1000,
      Number.isFinite(onboardingAt) ? onboardingAt : 0,
    );
    // Pre-onboarding history never opens a Cloud API customer service window.
    const recentInbound = await this.prisma.message.count({
      where: {
        conversationId,
        type: { in: ['LEAD_TEXT', 'LEAD_MEDIA'] },
        createdAt: { gt: new Date(windowStart) },
      },
    });
    if (!recentInbound) return block('OUTSIDE_24H_WINDOW');
    return { ok: true, conversation, channel, patientOptedOut } as const;
  }

  private async authorized(
    organizationId: string,
    conversationId: string,
    version: number,
    purpose: OutboundPurpose,
  ) {
    if (
      purpose !== 'staff' &&
      !(await this.auth.authorizeDelivery(
        organizationId,
        conversationId,
        AI_GENERATED.includes(purpose) ? version : undefined,
      ))
    )
      return null;
    const eligibility = await this.checkEligibility(
      organizationId,
      conversationId,
      purpose,
    );
    if (!eligibility.ok) return null;
    if (
      AI_GENERATED.includes(purpose) &&
      eligibility.conversation.assignedAgentId
    )
      return null;
    return eligibility;
  }

  async sendBubble(
    organizationId: string,
    conversationId: string,
    message: Message,
    version: number,
    purpose: OutboundPurpose = 'reply',
  ): Promise<AttemptResult> {
    if (!message.idempotencyKey || message.conversationId !== conversationId)
      throw new Error('OUTBOUND_INVALID_BUBBLE');
    // Intent is durable before any provider I/O. The unique message/key columns
    // make concurrent jobs converge on the same attempt.
    const attempt = await this.prisma.outboundAttempt.upsert({
      where: { messageId: message.id },
      create: {
        organizationId,
        conversationId,
        messageId: message.id,
        dedupeKey: message.idempotencyKey,
        conversationVersion: version,
        purpose,
      },
      update: {},
    });
    if (
      attempt.organizationId !== organizationId ||
      attempt.conversationId !== conversationId ||
      attempt.dedupeKey !== message.idempotencyKey ||
      attempt.conversationVersion !== version ||
      attempt.purpose !== purpose
    )
      throw new Error('OUTBOUND_ATTEMPT_SCOPE_MISMATCH');
    if (attempt.status === 'ACCEPTED') return 'ACCEPTED';
    if (attempt.status === 'UNKNOWN' || attempt.status === 'SENDING')
      return 'WAITING';
    if (attempt.status === 'CANCELLED') return 'CANCELLED';
    if (
      attempt.status === 'FAILED' &&
      (attempt.attemptCount >= 3 ||
        !['HTTP_429', 'PROVIDER_FAILED'].includes(attempt.lastErrorCode ?? ''))
    )
      return 'FAILED';

    const authorized = await this.authorized(
      organizationId,
      conversationId,
      version,
      purpose,
    );
    if (!authorized) {
      await this.prisma.outboundAttempt.updateMany({
        where: { id: attempt.id, status: { in: ['PENDING', 'FAILED'] } },
        data: { status: 'CANCELLED', lastErrorCode: 'DELIVERY_NOT_AUTHORIZED' },
      });
      await this.prisma.message.updateMany({
        where: { id: message.id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      return 'CANCELLED';
    }
    const claimed = await this.prisma.outboundAttempt.updateMany({
      where: { id: attempt.id, status: { in: ['PENDING', 'FAILED'] } },
      data: {
        status: 'SENDING',
        startedAt: new Date(),
        attemptCount: { increment: 1 },
        lastErrorCode: null,
      },
    });
    if (claimed.count !== 1) return 'WAITING';

    // One final authorization check after acquiring the send slot. If it
    // changed, cancel without contacting the provider.
    const current = await this.authorized(
      organizationId,
      conversationId,
      version,
      purpose,
    );
    if (!current) {
      await this.prisma.outboundAttempt.updateMany({
        where: { id: attempt.id, status: 'SENDING' },
        data: { status: 'CANCELLED', lastErrorCode: 'DELIVERY_NOT_AUTHORIZED' },
      });
      return 'CANCELLED';
    }
    let providerId: string | undefined;
    try {
      const response = message.mediaUrl
        ? await this.whatsapp.sendMediaMessage(
            current.channel.credentialId!,
            organizationId,
            current.conversation.externalContactId!,
            message.mediaUrl,
            message.content === '[Image Sent]' ? undefined : message.content,
            current.channel.providerAccountId,
            attempt.dedupeKey,
          )
        : await this.whatsapp.sendTextMessage(
            current.channel.credentialId!,
            organizationId,
            current.conversation.externalContactId!,
            message.content,
            current.channel.providerAccountId,
            attempt.dedupeKey,
          );
      providerId = response?.messages?.[0]?.id;
    } catch (error: any) {
      if (error instanceof OutboundNotSentError) {
        // Local failure before the POST (e.g. revoked credential): Meta was
        // never contacted, so this is a definite FAILED, not UNKNOWN.
        await this.prisma.outboundAttempt.updateMany({
          where: { id: attempt.id, status: 'SENDING' },
          data: { status: 'FAILED', lastErrorCode: error.code },
        });
        this.logger.warn(`OUTBOUND_NOT_SENT attempt=${attempt.id}`);
        return 'FAILED';
      }
      const code = Number(error?.response?.status ?? error?.status);
      // Only an explicit provider rejection is safe to retry. Timeout,
      // connection loss, and 5xx may mean Meta accepted the message.
      const rejected = code >= 400 && code < 500 && code !== 408;
      await this.prisma.outboundAttempt.updateMany({
        where: { id: attempt.id, status: 'SENDING' },
        data: {
          status: rejected ? 'FAILED' : 'UNKNOWN',
          lastErrorCode: rejected
            ? `HTTP_${code}`
            : 'AMBIGUOUS_PROVIDER_RESULT',
        },
      });
      this.logger.warn(
        `OUTBOUND_PROVIDER_RESULT_${rejected ? 'REJECTED' : 'UNKNOWN'} attempt=${attempt.id}`,
      );
      if (!rejected) await this.escalateUnknown(attempt.id);
      return code === 429 ? 'WAITING' : rejected ? 'FAILED' : 'WAITING';
    }
    if (!providerId) {
      await this.prisma.outboundAttempt.updateMany({
        where: { id: attempt.id, status: 'SENDING' },
        data: { status: 'UNKNOWN', lastErrorCode: 'MISSING_PROVIDER_ID' },
      });
      await this.escalateUnknown(attempt.id);
      return 'WAITING';
    }
    // If this commit fails after Meta accepted, the durable SENDING row will
    // become UNKNOWN. A status webhook can reconcile it by opaque key/ID.
    const committed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.outboundAttempt.updateMany({
        where: { id: attempt.id, status: { in: ['SENDING', 'ACCEPTED'] } },
        data: {
          status: 'ACCEPTED',
          providerId,
          acceptedAt: new Date(),
          lastErrorCode: null,
        },
      });
      if (updated.count !== 1) return false;
      await tx.message.updateMany({
        where: { id: message.id, status: { notIn: ['DELIVERED', 'READ'] } },
        data: { metaMessageId: providerId, status: 'SENT' },
      });
      return true;
    });
    return committed ? 'ACCEPTED' : 'WAITING';
  }

  async reconcileStatus(
    organizationId: string,
    providerId: string,
    status: 'sent' | 'delivered' | 'read' | 'failed',
    dedupeKey?: string,
  ) {
    const attempt = await this.prisma.outboundAttempt.findFirst({
      where: {
        organizationId,
        OR: [{ providerId }, ...(dedupeKey ? [{ dedupeKey }] : [])],
      },
    });
    if (!attempt || (attempt.providerId && attempt.providerId !== providerId))
      return;
    if (
      status === 'sent' &&
      attempt.status === 'FAILED' &&
      attempt.lastErrorCode === 'PROVIDER_FAILED'
    )
      return;
    if (status === 'failed') {
      const message = await this.prisma.message.findUnique({
        where: { id: attempt.messageId },
        select: { status: true },
      });
      if (message?.status === 'DELIVERED' || message?.status === 'READ') return;
      await this.prisma.outboundAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'FAILED',
          providerId,
          lastErrorCode: 'PROVIDER_FAILED',
        },
      });
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.outboundAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'ACCEPTED',
          providerId,
          acceptedAt: attempt.acceptedAt ?? new Date(),
          lastErrorCode: null,
        },
      });
      await tx.message.updateMany({
        where: {
          id: attempt.messageId,
          ...(status === 'sent'
            ? { status: { notIn: ['DELIVERED', 'READ'] } }
            : status === 'delivered'
              ? { status: { not: 'READ' } }
              : {}),
        },
        data: {
          metaMessageId: providerId,
          status:
            status === 'read'
              ? 'READ'
              : status === 'delivered'
                ? 'DELIVERED'
                : 'SENT',
        },
      });
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async retryConfirmedFailures() {
    await tenantStorage.run({ isSystemBypass: true }, async () => {
      const retryable = await this.prisma.outboundAttempt.findMany({
        where: {
          status: 'FAILED',
          lastErrorCode: { in: ['HTTP_429', 'PROVIDER_FAILED'] },
          attemptCount: { lt: 3 },
          updatedAt: { lt: new Date(Date.now() - 60_000) },
        },
        include: { message: true },
        take: 50,
        orderBy: { updatedAt: 'asc' },
      });
      for (const attempt of retryable) {
        await tenantStorage.run(
          { organizationId: attempt.organizationId, isSystemBypass: false },
          async () => {
            try {
              await this.sendBubble(
                attempt.organizationId,
                attempt.conversationId,
                attempt.message,
                attempt.conversationVersion,
                PURPOSES.includes(attempt.purpose as OutboundPurpose)
                  ? (attempt.purpose as OutboundPurpose)
                  : 'reply',
              );
            } catch {
              this.logger.error(`OUTBOUND_RETRY_FAILED attempt=${attempt.id}`);
            }
          },
        );
      }
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async markInterruptedSendsUnknown() {
    await tenantStorage.run({ isSystemBypass: true }, async () => {
      const result = await this.prisma.outboundAttempt.updateMany({
        where: {
          status: 'SENDING',
          startedAt: { lt: new Date(Date.now() - 2 * 60_000) },
        },
        data: { status: 'UNKNOWN', lastErrorCode: 'INTERRUPTED_SEND' },
      });
      if (result.count)
        this.logger.warn(`OUTBOUND_INTERRUPTED count=${result.count}`);
      // Also covers a crash between writing UNKNOWN and routing it.
      const unrouted = await this.prisma.outboundAttempt.findMany({
        where: { status: 'UNKNOWN', escalatedAt: null },
        select: { id: true },
        take: 100,
      });
      for (const { id } of unrouted) {
        try {
          await this.escalateUnknown(id);
        } catch {
          this.logger.error(`OUTBOUND_UNKNOWN_ESCALATION_FAILED attempt=${id}`);
        }
      }
    });
  }

  /**
   * An UNKNOWN send may or may not have reached the patient (R7: never
   * resend). Route it to people once: pause the AI (new patient messages
   * then go to staff, not into a stuck AI batch), bump stateVersion, alert
   * eligible staff to check WhatsApp before replying, and audit (KI-029).
   */
  async escalateUnknown(attemptId: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.outboundAttempt.updateMany({
        where: { id: attemptId, status: 'UNKNOWN', escalatedAt: null },
        data: { escalatedAt: new Date() },
      });
      if (claimed.count !== 1) return;
      const attempt = await tx.outboundAttempt.findUniqueOrThrow({
        where: { id: attemptId },
        include: { conversation: { include: { lead: true } } },
      });
      const { conversation, organizationId } = attempt;
      await tx.conversation.updateMany({
        where: { id: conversation.id, organizationId, aiPaused: false },
        data: { aiPaused: true, stateVersion: { increment: 1 } },
      });
      const staffNotified = await alertConversationStaff(tx, {
        organizationId,
        conversation,
        code: 'DELIVERY_UNKNOWN',
        title: 'Delivery uncertain',
        body: 'A WhatsApp message may or may not have reached the patient. Check WhatsApp before replying. The AI is paused for this conversation.',
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actor: 'system',
          action: 'outbound.delivery_unknown',
          targetId: conversation.id,
          metadata: {
            attemptId,
            purpose: attempt.purpose,
            lastErrorCode: attempt.lastErrorCode,
            staffNotified,
          },
        },
      });
    });
  }
}
