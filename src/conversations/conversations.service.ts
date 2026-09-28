import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../webhooks/whatsapp.service';
import { EventsGateway } from '../events/events/events.gateway';
import { PermissionService } from '../auth/permission.service';
import { ForbiddenException } from '@nestjs/common';
import { toConversationResponse } from './conversation-response.mapper';
import { toPublicMessageDto } from '../events/dto/public-events.dto';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
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

  async sendManualMessage(
    organizationId: string,
    userId: string,
    conversationId: string,
    content: string,
  ) {
    // 1. Find the conversation and verify ownership
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { organization: true, lead: true },
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

    const { lead } = conversation;

    // 🚀 NEW: Get active WhatsApp channel
    const channel = await this.prisma.channel.findFirst({
      where: {
        organizationId: organizationId,
        provider: 'WHATSAPP_CLOUD_API',
        status: 'ACTIVE',
      },
    });

    if (!channel || !channel.credentialId) {
      throw new BadRequestException(
        'Organization WhatsApp credentials missing',
      );
    }

    // 2. Send the message to Meta
    const metaResponse = await this.whatsappService.sendTextMessage(
      channel.credentialId,
      organizationId,
      lead?.phoneNumber || '', // Assuming the lead table holds the phone number!
      content,
      channel.providerAccountId,
    );

    // 3. Save it to our database (Marked as AGENT_TEXT)
    const newMessage = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        content: content,
        metaMessageId: metaResponse?.messages?.[0]?.id || null,
        type: 'USER_TEXT', // Distinguish human from AI
        handledBy: 'HUMAN',
        status: 'SENT',
      },
    });

    // 4. Update the conversation timestamp to bump it to the top of the inbox, and pause the AI
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), aiPaused: true },
    });

    // 5. Broadcast to the frontend using your exact working format!
    await this.eventsGateway
      .broadcastNewMessage(organizationId, newMessage)
      .catch(() => this.logger.warn('MANUAL_MESSAGE_BROADCAST_FAILED'));

    return newMessage;
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
