import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { MembershipStatus, Prisma } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';

const USER_PUBLIC_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
  email: true,
} as const;

const MESSAGE_WITH_SENDER_INCLUDE = {
  sender: {
    select: USER_PUBLIC_SELECT,
  },
} as const;

const CONVERSATION_WITH_DETAILS_INCLUDE = {
  assigned_agent: {
    select: USER_PUBLIC_SELECT,
  },
  lead: true,
  messages: {
    orderBy: { created_at: 'desc' as const },
    take: 1,
    include: MESSAGE_WITH_SENDER_INCLUDE,
  },
} as const;

export type MessageWithSender = Prisma.MessageGetPayload<{
  include: typeof MESSAGE_WITH_SENDER_INCLUDE;
}>;

export type ConversationWithDetails = Prisma.ConversationGetPayload<{
  include: typeof CONVERSATION_WITH_DETAILS_INCLUDE;
}>;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  private async assertActiveOrganizationMembers(
    orgId: string,
    userIds: string[],
  ): Promise<void> {
    const uniqueUserIds = Array.from(new Set(userIds));
    if (uniqueUserIds.length === 0) return;

    const activeMemberships = await this.prisma.organizationMembership.findMany(
      {
        where: {
          status: MembershipStatus.ACTIVE,
          user_id: {
            in: uniqueUserIds,
          },
        },
        select: {
          user_id: true,
        },
      },
    );

    const activeUserIds = new Set(activeMemberships.map((m) => m.user_id));
    const invalidUserIds = uniqueUserIds.filter((id) => !activeUserIds.has(id));

    if (invalidUserIds.length > 0) {
      throw new ForbiddenException(
        this.i18n.t('chat.ERRORS.PARTICIPANTS_OUTSIDE_SCOPE', {
          defaultValue: 'Agent is outside scope',
        }),
      );
    }
  }

  private async findExistingLeadConversation(
    orgId: string,
    leadId?: string,
    externalContactId?: string,
  ): Promise<ConversationWithDetails | null> {
    if (!leadId && !externalContactId) return null;

    return this.prisma.conversation.findFirst({
      where: {
        organization_id: orgId,
        OR: [
          ...(leadId ? [{ lead_id: leadId }] : []),
          ...(externalContactId ? [{ external_contact_id: externalContactId }] : []),
        ],
      },
      include: CONVERSATION_WITH_DETAILS_INCLUDE,
    });
  }

  /**
   * Send a message to a conversation
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
  ): Promise<MessageWithSender> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(this.i18n.t('chat.ERRORS.NOT_FOUND'));
    }

    if (conversation.assigned_agent_id !== senderId && conversation.handled_by !== 'AI') {
      throw new ForbiddenException(this.i18n.t('chat.ERRORS.NOT_MEMBER'));
    }

    const message = await this.prisma.message.create({
      data: {
        conversation_id: conversationId,
        sender_id: senderId,
        content,
      },
      include: MESSAGE_WITH_SENDER_INCLUDE,
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updated_at: new Date() },
    });

    this.logger.log(
      `[ChatService] Message sent to conversation ${conversationId}`,
    );

    return message;
  }

  /**
   * Get all conversations for a user in an organization
   */
  async getUserConversations(
    userId: string,
    orgId: string,
  ): Promise<ConversationWithDetails[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        organization_id: orgId,
        OR: [
          { handled_by: 'AI' },
          { assigned_agent_id: userId },
        ],
      },
      include: CONVERSATION_WITH_DETAILS_INCLUDE,
      orderBy: { updated_at: 'desc' },
    });

    return conversations;
  }

  /**
   * Get messages for a conversation (cursor paginated)
   */
  async getConversationMessages(
    conversationId: string,
    userId: string,
    cursor?: string,
    limit: number = 50,
  ): Promise<MessageWithSender[]> {
    const query = {
      where: { conversation_id: conversationId },
      include: MESSAGE_WITH_SENDER_INCLUDE,
      orderBy: { created_at: 'desc' as const },
      take: limit,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
    } satisfies Prisma.MessageFindManyArgs;

    return this.prisma.message.findMany(query);
  }

  /**
   * Get conversation details
   */
  async getConversation(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: CONVERSATION_WITH_DETAILS_INCLUDE,
    });

    if (!conversation) {
      throw new NotFoundException(this.i18n.t('chat.ERRORS.NOT_FOUND'));
    }

    if (conversation.assigned_agent_id !== userId && conversation.handled_by !== 'AI') {
      throw new ForbiddenException(this.i18n.t('chat.ERRORS.NOT_MEMBER'));
    }

    return conversation;
  }

  /**
   * Create a new 1-on-1 conversation with a lead
   */
  async createConversation(
    orgId: string,
    currentUserId: string,
    params: { leadId?: string; externalContactId?: string },
  ): Promise<ConversationWithDetails> {
    const { leadId, externalContactId } = params;

    if (!leadId && !externalContactId) {
      throw new BadRequestException('Either Lead ID or External Contact ID is required');
    }

    if (leadId) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: leadId },
      });

      if (!lead || lead.organization_id !== orgId) {
        throw new NotFoundException(
          this.i18n.t('leads.ERRORS.NOT_FOUND', { defaultValue: 'Lead not found' }),
        );
      }
    }

    await this.assertActiveOrganizationMembers(orgId, [currentUserId]);

    const existingConversation = await this.findExistingLeadConversation(
      orgId,
      leadId,
      externalContactId,
    );

    if (existingConversation) {
      this.logger.log(
        `[ChatService] Existing conversation found: ${existingConversation.id}`,
      );
      return existingConversation;
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        organization_id: orgId,
        is_group: false,
        lead_id: leadId,
        external_contact_id: externalContactId,
        assigned_agent_id: currentUserId,
        handled_by: 'HUMAN', // created by human agent
      },
      include: CONVERSATION_WITH_DETAILS_INCLUDE,
    });

    this.logger.log(
      `[ChatService] New conversation created: ${conversation.id}`,
    );

    return conversation;
  }
}
