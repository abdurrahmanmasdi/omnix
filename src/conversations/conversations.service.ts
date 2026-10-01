import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
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
import { toConversationResponse } from './conversation-response.mapper';
import { toPublicMessageDto } from '../events/dto/public-events.dto';

const MANUAL_SEND_BLOCKED: Record<DeliveryBlockReason, string> = {
  CONVERSATION_NOT_FOUND: 'Conversation not found.',
  PATIENT_OPTED_OUT:
    'The patient opted out (STOP). Messages can be sent again only after the patient replies START.',
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
    const dynamicWhere: any = { organizationId };
    if (!canReadAll) {
      dynamicWhere.lead = { assignedAgentId: userId };
    }
    const skip = (page - 1) * limit;

    const conversations = await this.prisma.conversation.findMany({
      where: dynamicWhere,
      orderBy: { updatedAt: 'desc' }, // Newest active conversations first
      take: limit,
      skip,
      include: {
        lead: true,
        // Fetch the single most recent message to show as a preview in the sidebar
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return conversations.map((conversation) =>
      toConversationResponse(conversation, canReadPii, canReadMessages),
    );
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
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    return {
      data: messages.map(toPublicMessageDto),
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
    );
    if (!eligibility.ok) {
      throw new UnprocessableEntityException({
        code: eligibility.reason,
        message: MANUAL_SEND_BLOCKED[eligibility.reason],
      });
    }

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
      // Eligibility changed between the check and the send (e.g. a STOP).
      throw new ConflictException({
        code: 'DELIVERY_NOT_AUTHORIZED',
        message: 'The message was not sent: the conversation changed.',
      });
    }
    return {
      ...toPublicMessageDto(saved),
      deliveryStatus: DELIVERY_STATUS[result],
    };
  }

  async toggleAiState(
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

    const updatedConversation = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { aiPaused: !conversation.aiPaused },
    });

    return updatedConversation;
  }
}
