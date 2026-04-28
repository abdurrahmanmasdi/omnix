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
  participants: {
    include: {
      user: {
        select: USER_PUBLIC_SELECT,
      },
    },
  },
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
        this.i18n.t('chat.ERRORS.PARTICIPANTS_OUTSIDE_SCOPE'),
      );
    }
  }

  private async findExistingDirectMessage(
    _orgId: string,
    userId1: string,
    userId2: string,
  ): Promise<ConversationWithDetails | null> {
    void _orgId;

    return this.prisma.conversation.findFirst({
      where: {
        is_group: false,
        participants: {
          every: {
            user_id: {
              in: [userId1, userId2],
            },
          },
        },
        AND: {
          participants: {
            every: {
              OR: [{ user_id: userId1 }, { user_id: userId2 }],
            },
          },
        },
      },
      include: CONVERSATION_WITH_DETAILS_INCLUDE,
    });
  }

  /**
   * Send a message to a conversation
   * @param conversationId - The conversation ID
   * @param senderId - The user ID sending the message
   * @param content - The message content
   * @returns The created message with sender information
   * @throws ForbiddenException if the sender is not a participant
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
  ): Promise<MessageWithSender> {
    // Validate that the sender is a participant in the conversation
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversation_id_user_id: {
          conversation_id: conversationId,
          user_id: senderId,
        },
      },
    });

    if (!participant) {
      throw new ForbiddenException(this.i18n.t('chat.ERRORS.NOT_MEMBER'));
    }

    // Create the message
    const message = await this.prisma.message.create({
      data: {
        conversation_id: conversationId,
        sender_id: senderId,
        content,
      },
      include: MESSAGE_WITH_SENDER_INCLUDE,
    });

    // Update the conversation's updated_at timestamp
    await this.prisma.conversation.updateMany({
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
   * @param userId - The user ID
   * @param orgId - The organization ID
   * @returns Array of conversations with latest message and participants
   */
  async getUserConversations(
    userId: string,
    _orgId: string,
  ): Promise<ConversationWithDetails[]> {
    void _orgId;

    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            user_id: userId,
          },
        },
      },
      include: CONVERSATION_WITH_DETAILS_INCLUDE,
      orderBy: { updated_at: 'desc' },
    });

    return conversations;
  }

  /**
   * Get messages for a conversation (cursor paginated)
   * @param conversationId - The conversation ID
   * @param userId - The user ID requesting the messages (for validation)
   * @param cursor - Optional message ID cursor for pagination
   * @param limit - Max number of messages to fetch (default 50)
   * @returns Array of messages ordered by newest first
   * @throws ForbiddenException if user is not a participant
   */
  async getConversationMessages(
    conversationId: string,
    userId: string,
    cursor?: string,
    limit: number = 50,
  ): Promise<MessageWithSender[]> {
    // Verify the user is a participant
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversation_id_user_id: {
          conversation_id: conversationId,
          user_id: userId,
        },
      },
    });

    if (!participant) {
      throw new ForbiddenException(this.i18n.t('chat.ERRORS.NOT_MEMBER'));
    }

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

    // Fetch message history with cursor pagination (newest first)
    const messages = await this.prisma.message.findMany(query);

    return messages;
  }

  /**
   * Get conversation details
   * @param conversationId - The conversation ID
   * @param userId - The user ID requesting (for validation)
   * @returns The conversation with all details
   * @throws NotFoundException if conversation doesn't exist
   * @throws ForbiddenException if user is not a participant
   */
  async getConversation(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: USER_PUBLIC_SELECT,
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(this.i18n.t('chat.ERRORS.NOT_FOUND'));
    }

    // Verify user is a participant
    const isParticipant = conversation.participants.some(
      (p) => p.user_id === userId,
    );

    if (!isParticipant) {
      throw new ForbiddenException(this.i18n.t('chat.ERRORS.NOT_MEMBER'));
    }

    return conversation;
  }

  /**
   * Create a new 1-on-1 conversation (Direct Message)
   * Or return existing conversation if one already exists between the two users
   * @param orgId - The organization ID
   * @param currentUserId - The user initiating the conversation
   * @param targetUserId - The user to start a DM with
   * @returns The created or existing conversation
   * @throws NotFoundException if target user doesn't exist
   */
  async createConversation(
    orgId: string,
    currentUserId: string,
    targetUserId: string,
  ): Promise<ConversationWithDetails> {
    // Validate that target user exists (and is in the same org if needed)
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException(
        this.i18n.t('organizations.ERRORS.USER_NOT_FOUND'),
      );
    }

    await this.assertActiveOrganizationMembers(orgId, [
      currentUserId,
      targetUserId,
    ]);

    // Check if a 1-on-1 conversation already exists between these two users in this organization
    const existingConversation = await this.findExistingDirectMessage(
      orgId,
      currentUserId,
      targetUserId,
    );

    // If conversation exists, return it
    if (existingConversation) {
      this.logger.log(
        `[ChatService] Existing conversation found: ${existingConversation.id}`,
      );
      return existingConversation;
    }

    // Create new conversation using a transaction
    const newConversation = await this.prisma.$transaction(async (tx) => {
      // Create the conversation
      const conversation = await tx.conversation.create({
        data: {
          organization_id: orgId,
          is_group: false,
        },
      });

      // Add both participants
      await tx.conversationParticipant.createMany({
        data: [
          {
            conversation_id: conversation.id,
            user_id: currentUserId,
          },
          {
            conversation_id: conversation.id,
            user_id: targetUserId,
          },
        ],
      });

      // Return the conversation with all necessary relations
      return tx.conversation.findUnique({
        where: { id: conversation.id },
        include: CONVERSATION_WITH_DETAILS_INCLUDE,
      });
    });

    if (!newConversation) {
      throw new NotFoundException(this.i18n.t('chat.ERRORS.NOT_FOUND'));
    }

    this.logger.log(
      `[ChatService] New conversation created: ${newConversation?.id}`,
    );

    return newConversation;
  }
}
