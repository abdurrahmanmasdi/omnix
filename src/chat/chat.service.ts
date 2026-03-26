import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Send a message to a conversation
   * @param conversationId - The conversation ID
   * @param senderId - The user ID sending the message
   * @param content - The message content
   * @returns The created message with sender information
   * @throws ForbiddenException if the sender is not a participant
   */
  async sendMessage(conversationId: string, senderId: string, content: string) {
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
      throw new ForbiddenException('You are not a member of this conversation');
    }

    // Create the message
    const message = await this.prisma.message.create({
      data: {
        conversation_id: conversationId,
        sender_id: senderId,
        content,
      },
      include: {
        sender: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
    });

    // Update the conversation's updated_at timestamp
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
   * @param userId - The user ID
   * @param orgId - The organization ID
   * @returns Array of conversations with latest message and participants
   */
  async getUserConversations(userId: string, orgId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        organization_id: orgId,
        participants: {
          some: {
            user_id: userId,
          },
        },
      },
      include: {
        messages: {
          orderBy: { created_at: 'desc' },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
              },
            },
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { updated_at: 'desc' },
    });

    return conversations;
  }

  /**
   * Get messages for a conversation (last 50)
   * @param conversationId - The conversation ID
   * @param userId - The user ID requesting the messages (for validation)
   * @returns Array of messages ordered by creation time
   * @throws ForbiddenException if user is not a participant
   */
  async getConversationMessages(conversationId: string, userId: string) {
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
      throw new ForbiddenException('You are not a member of this conversation');
    }

    // Fetch the last 50 messages
    const messages = await this.prisma.message.findMany({
      where: { conversation_id: conversationId },
      include: {
        sender: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
      take: 50,
    });

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
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Verify user is a participant
    const isParticipant = conversation.participants.some(
      (p) => p.user_id === userId,
    );

    if (!isParticipant) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    return conversation;
  }

  /**
   * Create a new conversation
   * @param orgId - The organization ID
   * @param participantIds - Array of user IDs to add as participants
   * @param isGroup - Whether this is a group conversation
   * @param name - Optional conversation name (for group chats)
   * @returns The created conversation
   */
  async createConversation(
    orgId: string,
    participantIds: string[],
    isGroup: boolean,
    name?: string,
  ) {
    const conversation = await this.prisma.conversation.create({
      data: {
        organization_id: orgId,
        is_group: isGroup,
        name,
        participants: {
          createMany: {
            data: participantIds.map((userId) => ({
              user_id: userId,
            })),
          },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    this.logger.log(`[ChatService] Conversation created: ${conversation.id}`);

    return conversation;
  }
}
