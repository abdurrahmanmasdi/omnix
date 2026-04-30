/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ChatService', () => {
  let service: ChatService;
  let mockPrismaService: any;

  const mockI18nService = {
    t: jest.fn((key: string) => key),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrismaService = {
      organizationMembership: {
        findMany: jest.fn(),
      },
      message: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      conversation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      lead: {
        findUnique: jest.fn(),
      },
    };

    // Default: all provided users are active org members
    mockPrismaService.organizationMembership.findMany.mockImplementation(
      async (args: { where?: { user_id?: { in?: string[] } } }) => {
        const ids = args?.where?.user_id?.in ?? [];
        return ids.map((id) => ({ user_id: id }));
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: I18nService,
          useValue: mockI18nService,
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  // ---------------------------------------------------------------------------
  // sendMessage
  // ---------------------------------------------------------------------------
  describe('sendMessage', () => {
    const conversationId = 'conv-123';
    const senderId = 'user-456';
    const content = 'Hello, world!';

    it('should send a message when the sender is the assigned agent', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        assigned_agent_id: senderId,
        handled_by: 'HUMAN',
      });

      const mockMessage = {
        id: 'msg-789',
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        sender: {
          id: senderId,
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
        },
      };

      mockPrismaService.message.create.mockResolvedValue(mockMessage);
      mockPrismaService.conversation.update.mockResolvedValue({});

      const result = await service.sendMessage(conversationId, senderId, content);

      expect(result).toEqual(mockMessage);
      expect(mockPrismaService.message.create).toHaveBeenCalledWith({
        data: {
          conversation_id: conversationId,
          sender_id: senderId,
          content,
        },
        include: expect.objectContaining({
          sender: expect.any(Object),
        }),
      });
      expect(mockPrismaService.conversation.update).toHaveBeenCalledWith({
        where: { id: conversationId },
        data: { updated_at: expect.any(Date) },
      });
    });

    it('should allow sending when conversation is handled by AI', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        assigned_agent_id: 'some-other-user',
        handled_by: 'AI',
      });

      const mockMessage = {
        id: 'msg-789',
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        sender: { id: senderId, first_name: 'J', last_name: 'D', email: 'j@d.com' },
      };

      mockPrismaService.message.create.mockResolvedValue(mockMessage);
      mockPrismaService.conversation.update.mockResolvedValue({});

      const result = await service.sendMessage(conversationId, senderId, content);
      expect(result).toEqual(mockMessage);
    });

    it('should throw NotFoundException when conversation does not exist', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(null);

      await expect(
        service.sendMessage(conversationId, senderId, content),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when sender is not assigned agent and handler is HUMAN', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        assigned_agent_id: 'other-user',
        handled_by: 'HUMAN',
      });

      await expect(
        service.sendMessage(conversationId, senderId, content),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.message.create).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getConversationMessages
  // ---------------------------------------------------------------------------
  describe('getConversationMessages', () => {
    const conversationId = 'conv-123';
    const userId = 'user-456';

    it('should return messages for a conversation', async () => {
      const mockMessages = [
        { id: 'msg-1', content: 'First', sender: { id: 'user-111' } },
        { id: 'msg-2', content: 'Second', sender: { id: userId } },
      ];

      mockPrismaService.message.findMany.mockResolvedValue(mockMessages);

      const result = await service.getConversationMessages(conversationId, userId);

      expect(result).toEqual(mockMessages);
      expect(result).toHaveLength(2);
      expect(mockPrismaService.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversation_id: conversationId },
          orderBy: { created_at: 'desc' },
          take: 50,
        }),
      );
    });

    it('should apply cursor pagination when cursor and limit are provided', async () => {
      mockPrismaService.message.findMany.mockResolvedValue([]);

      await service.getConversationMessages(conversationId, userId, 'msg-cursor-1', 20);

      expect(mockPrismaService.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversation_id: conversationId },
          take: 20,
          skip: 1,
          cursor: { id: 'msg-cursor-1' },
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getConversation
  // ---------------------------------------------------------------------------
  describe('getConversation', () => {
    const conversationId = 'conv-123';
    const userId = 'user-456';

    it('should return conversation when user is the assigned agent', async () => {
      const mockConversation = {
        id: conversationId,
        organization_id: 'org-123',
        assigned_agent_id: userId,
        handled_by: 'HUMAN',
        lead: null,
        assigned_agent: { id: userId, first_name: 'John', last_name: 'Doe', email: 'john@example.com' },
        messages: [],
      };

      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);

      const result = await service.getConversation(conversationId, userId);
      expect(result).toEqual(mockConversation);
    });

    it('should return conversation when handled_by is AI', async () => {
      const mockConversation = {
        id: conversationId,
        organization_id: 'org-123',
        assigned_agent_id: 'other-user',
        handled_by: 'AI',
        lead: null,
        assigned_agent: null,
        messages: [],
      };

      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);

      const result = await service.getConversation(conversationId, userId);
      expect(result).toEqual(mockConversation);
    });

    it('should throw NotFoundException when conversation does not exist', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(null);

      await expect(
        service.getConversation(conversationId, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not assigned agent and not AI', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        organization_id: 'org-123',
        assigned_agent_id: 'user-999',
        handled_by: 'HUMAN',
        lead: null,
        assigned_agent: null,
        messages: [],
      });

      await expect(
        service.getConversation(conversationId, userId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ---------------------------------------------------------------------------
  // getUserConversations
  // ---------------------------------------------------------------------------
  describe('getUserConversations', () => {
    const userId = 'user-456';
    const orgId = 'org-123';

    it('should fetch conversations assigned to user or handled by AI', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          organization_id: orgId,
          assigned_agent_id: userId,
          handled_by: 'HUMAN',
          lead: null,
          assigned_agent: { id: userId, first_name: 'J', last_name: 'D', email: 'j@d.com' },
          messages: [],
        },
      ];

      mockPrismaService.conversation.findMany.mockResolvedValue(mockConversations);

      const result = await service.getUserConversations(userId, orgId);

      expect(result).toEqual(mockConversations);
      expect(mockPrismaService.conversation.findMany).toHaveBeenCalledWith({
        where: {
          organization_id: orgId,
          OR: [
            { handled_by: 'AI' },
            { assigned_agent_id: userId },
          ],
        },
        include: expect.any(Object),
        orderBy: { updated_at: 'desc' },
      });
    });

    it('should return empty array when user has no conversations', async () => {
      mockPrismaService.conversation.findMany.mockResolvedValue([]);

      const result = await service.getUserConversations(userId, orgId);
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // createConversation
  // ---------------------------------------------------------------------------
  describe('createConversation', () => {
    const orgId = 'org-123';
    const currentUserId = 'user-1';
    const leadId = 'lead-1';
    const externalContactId = '+905551234567';

    it('should create a conversation linked to a lead', async () => {
      mockPrismaService.lead.findUnique.mockResolvedValue({
        id: leadId,
        organization_id: orgId,
      });
      mockPrismaService.conversation.findFirst.mockResolvedValue(null);

      const mockCreated = {
        id: 'conv-new',
        organization_id: orgId,
        is_group: false,
        lead_id: leadId,
        external_contact_id: null,
        assigned_agent_id: currentUserId,
        handled_by: 'HUMAN',
        lead: { id: leadId },
        assigned_agent: { id: currentUserId },
        messages: [],
      };
      mockPrismaService.conversation.create.mockResolvedValue(mockCreated);

      const result = await service.createConversation(orgId, currentUserId, {
        leadId,
      });

      expect(result).toEqual(mockCreated);
      expect(result.lead_id).toBe(leadId);
      expect(mockPrismaService.lead.findUnique).toHaveBeenCalledWith({
        where: { id: leadId },
      });
    });

    it('should create a conversation with externalContactId (no lead)', async () => {
      mockPrismaService.conversation.findFirst.mockResolvedValue(null);

      const mockCreated = {
        id: 'conv-ext',
        organization_id: orgId,
        is_group: false,
        lead_id: null,
        external_contact_id: externalContactId,
        assigned_agent_id: currentUserId,
        handled_by: 'HUMAN',
        lead: null,
        assigned_agent: { id: currentUserId },
        messages: [],
      };
      mockPrismaService.conversation.create.mockResolvedValue(mockCreated);

      const result = await service.createConversation(orgId, currentUserId, {
        externalContactId,
      });

      expect(result).toEqual(mockCreated);
      expect(result.external_contact_id).toBe(externalContactId);
      expect(mockPrismaService.lead.findUnique).not.toHaveBeenCalled();
    });

    it('should return existing conversation if one matches leadId', async () => {
      const existing = {
        id: 'conv-existing',
        organization_id: orgId,
        lead_id: leadId,
        lead: { id: leadId },
        assigned_agent: { id: currentUserId },
        messages: [],
      };

      mockPrismaService.lead.findUnique.mockResolvedValue({
        id: leadId,
        organization_id: orgId,
      });
      mockPrismaService.conversation.findFirst.mockResolvedValue(existing);

      const result = await service.createConversation(orgId, currentUserId, {
        leadId,
      });

      expect(result).toEqual(existing);
      expect(mockPrismaService.conversation.create).not.toHaveBeenCalled();
    });

    it('should return existing conversation if one matches externalContactId', async () => {
      const existing = {
        id: 'conv-ext-existing',
        organization_id: orgId,
        external_contact_id: externalContactId,
        lead: null,
        assigned_agent: { id: currentUserId },
        messages: [],
      };

      mockPrismaService.conversation.findFirst.mockResolvedValue(existing);

      const result = await service.createConversation(orgId, currentUserId, {
        externalContactId,
      });

      expect(result).toEqual(existing);
      expect(mockPrismaService.conversation.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when neither leadId nor externalContactId is provided', async () => {
      await expect(
        service.createConversation(orgId, currentUserId, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when lead does not exist', async () => {
      mockPrismaService.lead.findUnique.mockResolvedValue(null);

      await expect(
        service.createConversation(orgId, currentUserId, { leadId }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when lead belongs to a different org', async () => {
      mockPrismaService.lead.findUnique.mockResolvedValue({
        id: leadId,
        organization_id: 'other-org',
      });

      await expect(
        service.createConversation(orgId, currentUserId, { leadId }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when agent is not an active org member', async () => {
      mockPrismaService.lead.findUnique.mockResolvedValue({
        id: leadId,
        organization_id: orgId,
      });
      // Override the default: return empty (user is NOT a member)
      mockPrismaService.organizationMembership.findMany.mockResolvedValueOnce([]);

      await expect(
        service.createConversation(orgId, currentUserId, { leadId }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
