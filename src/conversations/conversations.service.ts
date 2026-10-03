import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttemptResult,
  DeliveryBlockReason,
  OutboundAttemptService,
} from '../webhooks/outbound-attempt.service';
import { EventsGateway } from '../events/events/events.gateway';
import { PermissionService } from '../auth/permission.service';
import { ForbiddenException } from '@nestjs/common';
import {
  INBOX_LEAD_INCLUDE,
  toInboxMessage,
  toConversationResponse,
} from './conversation-response.mapper';
import { toPublicMessageDto } from '../events/dto/public-events.dto';

// PATIENT_OPTED_OUT never blocks a staff send (D-021); it is a warning.
const MANUAL_SEND_BLOCKED: Record<
  Exclude<DeliveryBlockReason, 'PATIENT_OPTED_OUT'>,
  string
> = {
  CONVERSATION_NOT_FOUND: 'Conversation not found.',
  CLINIC_INACTIVE: 'The clinic account is inactive.',
  CHANNEL_UNAVAILABLE:
    'The WhatsApp channel or its credential is not active for this conversation.',
  NO_CONTACT: 'This conversation has no WhatsApp contact.',
  OUTSIDE_24H_WINDOW:
    'The last patient message is older than 24 hours. WhatsApp only allows approved templates after that, and none are configured yet.',
};

/** What staff see after the send: SENT, UNKNOWN (check WhatsApp) or FAILED. */
const DELIVERY_STATUS: Record<AttemptResult, string> = {
  ACCEPTED: 'SENT',
  WAITING: 'UNKNOWN',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
};

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboundAttempts: OutboundAttemptService,
    private readonly eventsGateway: EventsGateway,
    private readonly permissionService: PermissionService,
  ) {}

  async getConversations(
    organizationId: string,
    userId: string,
    page: number = 1,
    limit: number = 20,
    filter?: string,
    leadId?: string,
  ) {
    const canReadAll = await this.permissionService.has(
      userId,
      organizationId,
      'leads:read:all',
    );
    const [canReadPii, canReadMessages] = await Promise.all([
      this.permissionService.has(userId, organizationId, 'leads:read:pii'),
      this.permissionService.has(userId, organizationId, 'leads:read:messages'),
    ]);
    const dynamicWhere: Prisma.ConversationWhereInput = {
      organizationId,
      deletedAt: null,
    };
    if (!canReadAll) {
      dynamicWhere.lead = { assignedAgentId: userId };
    }
    const filters: Record<string, Prisma.ConversationWhereInput> = {
      needs_reply: { aiPaused: true, status: { not: 'CLOSED' } },
      handed_off: {
        OR: [{ status: 'ESCALATED' }, { lead: { status: 'HANDED_OFF' } }],
      },
      ai_active: {
        aiPaused: false,
        status: 'ACTIVE',
        OR: [{ lead: null }, { lead: { optedOutAt: null } }],
      },
      mine: { lead: { assignedAgentId: userId } },
      unassigned: { lead: { assignedAgentId: null } },
    };
    if (filter && filters[filter]) dynamicWhere.AND = [filters[filter]];
    if (leadId) dynamicWhere.leadId = leadId;
    const skip = (page - 1) * limit;

    const conversations = await this.prisma.conversation.findMany({
      where: dynamicWhere,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      skip,
      include: {
        lead: { include: INBOX_LEAD_INCLUDE },
        // Fetch the single most recent message to show as a preview in the sidebar
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { outboundAttempt: { select: { status: true } } },
        },
      },
    });

    return conversations.map((conversation) =>
      toConversationResponse(conversation, canReadPii, canReadMessages),
    );
  }

  async getConversation(organizationId: string, userId: string, id: string) {
    await this.findAccessibleConversation(organizationId, userId, id);
    const [canReadPii, canReadMessages] = await Promise.all([
      this.permissionService.has(userId, organizationId, 'leads:read:pii'),
      this.permissionService.has(userId, organizationId, 'leads:read:messages'),
    ]);
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id, organizationId, deletedAt: null },
      include: {
        lead: { include: INBOX_LEAD_INCLUDE },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { outboundAttempt: { select: { status: true } } },
        },
      },
    });
    return toConversationResponse(conversation, canReadPii, canReadMessages);
  }

  async getMessages(
    organizationId: string,
    userId: string,
    conversationId: string,
    cursor?: string,
    limit: number = 50,
  ) {
    // Verify the conversation actually belongs to this organization
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { lead: true },
    });

    if (!conversation || conversation.organizationId !== organizationId) {
      throw new NotFoundException('Conversation not found');
    }
    const canReadAll = await this.permissionService.has(
      userId,
      organizationId,
      'leads:read:all',
    );
    if (!canReadAll && conversation.lead?.assignedAgentId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this conversation',
      );
    }
    if (
      !(await this.permissionService.has(
        userId,
        organizationId,
        'leads:read:messages',
      ))
    ) {
      throw new ForbiddenException('Message access is not granted');
    }

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: { outboundAttempt: { select: { status: true } } },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    return {
      data: messages.map(toInboxMessage),
      hasMore,
      nextCursor: hasMore ? messages[messages.length - 1].id : null,
    };
  }

  /**
   * Staff reply through the same delivery pipeline as AI bubbles (KI-023):
   * eligibility first (opt-out, 24 h window, channel), then AI pause +
   * stateVersion bump + message + audit in one commit, then OutboundAttempt.
   * The version bump invalidates any AI reply generated before this send.
   */
  async sendManualMessage(
    organizationId: string,
    userId: string,
    conversationId: string,
    content: string,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { lead: true },
    });

    if (!conversation || conversation.organizationId !== organizationId) {
      throw new NotFoundException('Conversation not found');
    }
    const canReadAll = await this.permissionService.has(
      userId,
      organizationId,
      'leads:read:all',
    );
    if (!canReadAll && conversation.lead?.assignedAgentId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this conversation',
      );
    }

    const eligibility = await this.outboundAttempts.checkEligibility(
      organizationId,
      conversationId,
      'staff',
    );
    if (!eligibility.ok) {
      const reason = eligibility.reason as keyof typeof MANUAL_SEND_BLOCKED;
      throw new UnprocessableEntityException({
        code: reason,
        message: MANUAL_SEND_BLOCKED[reason],
      });
    }
    const patientOptedOut = eligibility.patientOptedOut;

    const messageId = randomUUID();
    const { message, version } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.conversation.update({
        where: { id: conversation.id },
        data: { aiPaused: true, stateVersion: { increment: 1 } },
        select: { stateVersion: true },
      });
      const created = await tx.message.create({
        data: {
          id: messageId,
          conversationId: conversation.id,
          senderId: userId,
          content,
          type: 'USER_TEXT',
          handledBy: 'HUMAN',
          status: 'PENDING',
          idempotencyKey: `staff-${messageId}`,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actor: userId,
          action: 'conversation.staff_message_sent',
          targetId: conversation.id,
          metadata: {
            messageId,
            aiPausedBefore: conversation.aiPaused,
            ...(patientOptedOut ? { patientOptedOut: true } : {}),
          },
        },
      });
      return { message: created, version: updated.stateVersion };
    });

    const result = await this.outboundAttempts.sendBubble(
      organizationId,
      conversation.id,
      message,
      version,
      'staff',
    );
    const saved = await this.prisma.message.findUniqueOrThrow({
      where: { id: message.id },
    });
    await this.eventsGateway
      .broadcastNewMessage(organizationId, saved)
      .catch(() => this.logger.warn('MANUAL_MESSAGE_BROADCAST_FAILED'));
    if (result === 'CANCELLED') {
      // Eligibility changed between the check and the send (channel,
      // clinic or window; a STOP never cancels a staff send).
      throw new ConflictException({
        code: 'DELIVERY_NOT_AUTHORIZED',
        message: 'The message was not sent: the conversation changed.',
      });
    }
    return {
      ...toPublicMessageDto(saved),
      deliveryStatus: DELIVERY_STATUS[result],
      warnings: patientOptedOut ? ['PATIENT_OPTED_OUT'] : [],
    };
  }

  /**
   * Explicit, idempotent AI pause/resume (replaces the toggle). A change bumps
   * stateVersion so in-flight AI work is invalidated, and is audited with the
   * acting user. Repeating the same request (double click) changes nothing.
   */
  async setAiPaused(
    organizationId: string,
    userId: string,
    conversationId: string,
    paused: boolean,
  ) {
    const conversation = await this.findAccessibleConversation(
      organizationId,
      userId,
      conversationId,
    );
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.conversation.updateMany({
        where: { id: conversation.id, organizationId, aiPaused: !paused },
        data: { aiPaused: paused, stateVersion: { increment: 1 } },
      });
      if (changed.count === 1) {
        await tx.auditLog.create({
          data: {
            organizationId,
            actor: userId,
            action: paused
              ? 'conversation.ai_paused'
              : 'conversation.ai_resumed',
            targetId: conversation.id,
          },
        });
      }
      return tx.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
        include: { lead: true },
      });
    });
    try {
      await this.eventsGateway.broadcastConversationUpdate(
        organizationId,
        updated,
      );
    } catch {
      // The state change is committed; live delivery is best effort.
      this.logger.warn('AI_STATE_BROADCAST_FAILED');
    }
    return { id: updated.id, aiPaused: updated.aiPaused };
  }

  /** @deprecated Use setAiPaused; kept for the old PATCH toggle-ai route. */
  async toggleAiState(
    organizationId: string,
    userId: string,
    conversationId: string,
  ) {
    const conversation = await this.findAccessibleConversation(
      organizationId,
      userId,
      conversationId,
    );
    return this.setAiPaused(
      organizationId,
      userId,
      conversationId,
      !conversation.aiPaused,
    );
  }

  private async findAccessibleConversation(
    organizationId: string,
    userId: string,
    conversationId: string,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { lead: true },
    });

    if (!conversation || conversation.organizationId !== organizationId) {
      throw new NotFoundException('Conversation not found');
    }
    const canReadAll = await this.permissionService.has(
      userId,
      organizationId,
      'leads:read:all',
    );
    if (!canReadAll && conversation.lead?.assignedAgentId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this conversation',
      );
    }
    return conversation;
  }
}
