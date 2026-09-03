import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { WhatsappService } from '../webhooks/whatsapp.service';
import { EventsGateway } from '../events/events/events.gateway';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async getConversations(
    organizationId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const skip = (page - 1) * limit;

    const conversations = await this.prisma.conversation.findMany({
      where: { organizationId },
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

    return conversations;
  }

  async getMessages(
    organizationId: string,
    conversationId: string,
    page: number = 1,
    limit: number = 50,
  ) {
    const skip = (page - 1) * limit;

    // Verify the conversation actually belongs to this organization
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation || conversation.organizationId !== organizationId) {
      throw new Error('Conversation not found');
    }

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' }, // Newest first (we will invert this on the frontend)
      take: limit,
      skip,
    });

    return messages;
  }

  async sendManualMessage(
    organizationId: string,
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

    const { organization, lead } = conversation;

    // 🚀 NEW: Get active WhatsApp channel
    const channel = await this.prisma.channel.findFirst({
      where: {
        organizationId: organizationId,
        provider: 'WHATSAPP_CLOUD_API',
        status: 'ACTIVE',
      },
    });

    if (!channel) {
      throw new BadRequestException(
        'Organization WhatsApp credentials missing',
      );
    }

    // 2. Send the message to Meta
    const metaResponse = await this.whatsappService.sendTextMessage(
      lead?.phoneNumber || '', // Assuming the lead table holds the phone number!
      channel.accessToken,
      channel.providerAccountId,
      content,
    );

    // 3. Save it to our database (Marked as AGENT_TEXT)
    const newMessage = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        content: content,
        metaMessageId: metaResponse?.messages?.[0]?.id || null,
        type: 'USER_TEXT', // Distinguish human from AI
        handledBy: 'HUMAN',
      },
    });

    // 4. Update the conversation timestamp to bump it to the top of the inbox
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    // 5. Broadcast to the frontend using your exact working format!
    this.eventsGateway.broadcastNewMessage(organizationId, newMessage);

    return newMessage;
  }

  async toggleAiState(organizationId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation || conversation.organizationId !== organizationId) {
      throw new NotFoundException('Conversation not found');
    }

    const updatedConversation = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { aiPaused: !conversation.aiPaused },
    });

    return updatedConversation;
  }
}
