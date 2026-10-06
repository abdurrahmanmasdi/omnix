import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { tenantStorage } from '../core/tenant/tenant.context';
import { alertConversationStaff } from '../notifications/conversation-staff-alert';

const LEASE_MS = 120_000;
const leaseEnd = () => new Date(Date.now() + LEASE_MS);

@Injectable()
export class InboundClaimService {
  private readonly logger = new Logger(InboundClaimService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Decision 4 (QA-1F, KI-086): a clinic without an AI persona cannot be
   * answered by the AI. Instead of skipping silently, pause the AI and alert
   * the conversation's staff once. The aiPaused transition is the dedupe, so
   * later messages and retried jobs add no alerts.
   */
  private async handOffWithoutPersona(
    organizationId: string,
    conversation: {
      id: string;
      leadId: string | null;
      assignedAgentId: string | null;
      lead?: { assignedAgentId: string | null } | null;
    },
  ) {
    this.logger.warn(`AI_PERSONA_MISSING conversationId=${conversation.id}`);
    await this.prisma.$transaction(async (tx) => {
      const paused = await tx.conversation.updateMany({
        where: { id: conversation.id, organizationId, aiPaused: false },
        data: { aiPaused: true, stateVersion: { increment: 1 } },
      });
      if (paused.count !== 1) return;
      await tx.auditLog.create({
        data: {
          organizationId,
          actor: 'system',
          action: 'conversation.ai_paused',
          targetId: conversation.id,
          metadata: { reason: 'AI_PERSONA_MISSING' },
        },
      });
      await alertConversationStaff(tx, {
        organizationId,
        conversation,
        code: 'AI_PERSONA_MISSING',
        title: 'AI is not set up',
        body: 'No AI persona is configured for this clinic, so the AI did not answer. The conversation is waiting for staff.',
      });
    });
  }

  async claim(organizationId: string, conversationId: string, ids: string[]) {
    if (
      !organizationId ||
      !conversationId ||
      !Array.isArray(ids) ||
      ids.length === 0 ||
      ids.length > 100 ||
      ids.some((id) => typeof id !== 'string' || id.length < 1)
    )
      return null;
    // A forged or stale cross-tenant job must never terminalize another
    // tenant's message rows, which do not themselves carry organizationId.
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, organizationId, deletedAt: null },
      include: { lead: true, channel: true },
    });
    if (!conversation) return null;
    const uniqueIds = [...new Set(ids)];
    const pending = await this.prisma.message.findMany({
      where: {
        id: { in: uniqueIds },
        conversationId,
        status: 'PENDING',
        deletedAt: null,
        type: { in: ['LEAD_TEXT', 'LEAD_MEDIA'] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (pending.length === 0) return null;

    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, isActive: true, deleted_at: null },
      include: { aiPersona: true },
    });
    const channel = conversation?.channel;
    const eligible =
      organization?.aiPersona &&
      conversation &&
      !conversation.aiPaused &&
      !conversation.lead?.optedOutAt &&
      channel &&
      channel.status === 'ACTIVE' &&
      channel.organizationId === organizationId &&
      channel.credentialId &&
      conversation.externalContactId;
    if (!eligible) {
      if (
        organization &&
        !organization.aiPersona &&
        !conversation.aiPaused &&
        !conversation.lead?.optedOutAt
      )
        await this.handOffWithoutPersona(organizationId, conversation);
      await this.prisma.message.updateMany({
        where: {
          conversationId,
          id: { in: pending.map((message) => message.id) },
          status: 'PENDING',
        },
        data: { status: 'PROCESSED' },
      });
      return null;
    }

    const owner = randomUUID();
    const acquired = await this.prisma.conversation.updateMany({
      where: {
        id: conversationId,
        organizationId,
        aiPaused: false,
        deletedAt: null,
        OR: [
          { generationOwner: null },
          { generationLeaseUntil: { lt: new Date() } },
        ],
      },
      data: { generationOwner: owner, generationLeaseUntil: leaseEnd() },
    });
    if (acquired.count !== 1) return null; // Another generation owns this conversation.
    try {
      // Once the durable payload proves this conversation has work, claim its
      // oldest pending inbound rows together. This folds rapid arrivals and
      // previously interrupted rows into one generation instead of producing
      // a second reply from a partial batch.
      const batch = await this.prisma.message.findMany({
        where: {
          conversationId,
          status: 'PENDING',
          deletedAt: null,
          type: { in: ['LEAD_TEXT', 'LEAD_MEDIA'] },
        },
        select: { id: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 100,
      });
      const claimed = await this.prisma.message.updateMany({
        where: {
          conversationId,
          id: { in: batch.map((message) => message.id) },
          status: 'PENDING',
          deletedAt: null,
          type: { in: ['LEAD_TEXT', 'LEAD_MEDIA'] },
        },
        data: {
          status: 'PROCESSING',
          processingOwner: owner,
          processingLeaseUntil: leaseEnd(),
        },
      });
      if (claimed.count === 0) return null;
      const owned = await this.prisma.message.findMany({
        where: {
          conversationId,
          processingOwner: owner,
          status: 'PROCESSING',
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const currentConversation = await this.prisma.conversation.findFirst({
        where: { id: conversationId, organizationId, deletedAt: null },
        include: { lead: true, channel: true },
      });
      return {
        owner,
        organization,
        conversation: currentConversation ?? conversation,
        channel,
        messageIds: owned.map((message) => message.id),
      };
    } finally {
      // If claim lost the race, avoid holding an unused conversation lease.
      const owned = await this.prisma.message.count({
        where: { conversationId, processingOwner: owner, status: 'PROCESSING' },
      });
      if (!owned) await this.releaseConversation(conversationId, owner);
    }
  }

  async heartbeat(
    conversationId: string,
    owner: string,
    messageIds: string[],
  ): Promise<boolean> {
    const updated = await this.prisma.conversation.updateMany({
      where: {
        id: conversationId,
        generationOwner: owner,
        generationLeaseUntil: { gt: new Date() },
      },
      data: { generationLeaseUntil: leaseEnd() },
    });
    if (updated.count !== 1) return false;
    await this.prisma.message.updateMany({
      where: {
        conversationId,
        id: { in: messageIds },
        processingOwner: owner,
        status: 'PROCESSING',
      },
      data: { processingLeaseUntil: leaseEnd() },
    });
    return true;
  }

  async owns(conversationId: string, owner: string): Promise<boolean> {
    return (
      (await this.prisma.conversation.count({
        where: {
          id: conversationId,
          generationOwner: owner,
          generationLeaseUntil: { gt: new Date() },
        },
      })) === 1
    );
  }

  async finish(
    conversationId: string,
    owner: string,
    messageIds: string[],
    status: 'PENDING' | 'PROCESSED',
  ) {
    await this.prisma.message.updateMany({
      where: {
        conversationId,
        id: { in: messageIds },
        processingOwner: owner,
        status: 'PROCESSING',
      },
      data: {
        status,
        processingOwner: null,
        processingLeaseUntil: null,
        ...(status === 'PENDING' ? { recoveryQueuedAt: null } : {}),
      },
    });
  }

  async releaseConversation(conversationId: string, owner: string) {
    await this.prisma.conversation.updateMany({
      where: {
        id: conversationId,
        generationOwner: owner,
      },
      data: { generationOwner: null, generationLeaseUntil: null },
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async recoverInbound() {
    await tenantStorage.run({ isSystemBypass: true }, async () => {
      const now = new Date();
      const expired = await this.prisma.message.updateMany({
        where: {
          status: 'PROCESSING',
          processingLeaseUntil: { lt: now },
          conversation: {
            OR: [
              { generationOwner: null },
              { generationLeaseUntil: { lt: now } },
            ],
          },
        },
        data: {
          status: 'PENDING',
          processingOwner: null,
          processingLeaseUntil: null,
          recoveryQueuedAt: null,
        },
      });
      if (expired.count)
        this.logger.warn(`INBOUND_LEASE_RECOVERED count=${expired.count}`);
      const pending = await this.prisma.message.findMany({
        where: {
          status: 'PENDING',
          type: { in: ['LEAD_TEXT', 'LEAD_MEDIA'] },
          deletedAt: null,
          createdAt: { lt: new Date(Date.now() - 60_000) },
          OR: [
            { recoveryQueuedAt: null },
            { recoveryQueuedAt: { lt: new Date(Date.now() - 300_000) } },
          ],
        },
        select: {
          id: true,
          conversationId: true,
          conversation: {
            select: {
              organizationId: true,
              stateVersion: true,
            },
          },
        },
        take: 100,
        orderBy: { createdAt: 'asc' },
      });
      for (const message of pending) {
        await this.prisma.$transaction(async (tx) => {
          const marked = await tx.message.updateMany({
            where: {
              id: message.id,
              status: 'PENDING',
              OR: [
                { recoveryQueuedAt: null },
                { recoveryQueuedAt: { lt: new Date(Date.now() - 300_000) } },
              ],
            },
            data: { recoveryQueuedAt: new Date() },
          });
          if (marked.count !== 1) return;
          await tx.outboxEvent.create({
            data: {
              organizationId: message.conversation.organizationId,
              topic: 'generate-reply',
              payload: {
                organizationId: message.conversation.organizationId,
                conversationId: message.conversationId,
                messageId: message.id,
                stateVersion: message.conversation.stateVersion,
              },
            },
          });
        });
      }
    });
  }
}
