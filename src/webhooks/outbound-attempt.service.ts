import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Message } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tenantStorage } from '../core/tenant/tenant.context';
import { DeliveryAuthService } from './delivery-auth.service';
import { WhatsappService } from './whatsapp.service';

export type AttemptResult = 'ACCEPTED' | 'WAITING' | 'FAILED' | 'CANCELLED';

@Injectable()
export class OutboundAttemptService {
  private readonly logger = new Logger(OutboundAttemptService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: DeliveryAuthService,
    private readonly whatsapp: WhatsappService,
  ) {}

  private async authorized(
    organizationId: string,
    conversationId: string,
    version: number,
  ) {
    if (
      !(await this.auth.authorizeDelivery(
        organizationId,
        conversationId,
        version,
      ))
    )
      return null;
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, organizationId, deletedAt: null },
      include: { channel: true, lead: true, organization: true },
    });
    const channel = conversation?.channel;
    if (
      !conversation ||
      conversation.assignedAgentId ||
      conversation.lead?.optedOutAt ||
      !conversation.organization.isActive ||
      conversation.organization.deleted_at ||
      !channel ||
      channel.organizationId !== organizationId ||
      channel.status !== 'ACTIVE' ||
      !channel.credentialId ||
      !channel.providerAccountId ||
      !conversation.externalContactId
    )
      return null;
    // Meta allows free-form text/media only within 24 hours of the most
    // recent customer message. No approved template is configured here.
    const recentInbound = await this.prisma.message.count({
      where: {
        conversationId,
        type: { in: ['LEAD_TEXT', 'LEAD_MEDIA'] },
        createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (!recentInbound) return null;
    return { conversation, channel };
  }

  async sendBubble(
    organizationId: string,
    conversationId: string,
    message: Message,
    version: number,
    purpose: 'reply' | 'follow-up' = 'reply',
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
      return code === 429 ? 'WAITING' : rejected ? 'FAILED' : 'WAITING';
    }
    if (!providerId) {
      await this.prisma.outboundAttempt.updateMany({
        where: { id: attempt.id, status: 'SENDING' },
        data: { status: 'UNKNOWN', lastErrorCode: 'MISSING_PROVIDER_ID' },
      });
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
                attempt.purpose === 'follow-up' ? 'follow-up' : 'reply',
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
    });
  }
}
