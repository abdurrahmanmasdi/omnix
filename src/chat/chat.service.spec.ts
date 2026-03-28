/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ChatService', () => {
  let service: ChatService;
  let mockPrismaService: any;

  beforeEach(async () => {
    // Recreate mocks fresh for each test
    mockPrismaService = {
      organizationMembership: {
        findMany: jest.fn(),
      },
      conversationParticipant: {
        findUnique: jest.fn(),
        createMany: jest.fn(),
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
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    // Setup $transaction to pass the mockPrismaService itself as the tx parameter
    mockPrismaService.$transaction.mockImplementation(async (cb) => {
      return cb(mockPrismaService);
    });

    // Default to all provided users being active members in the requested org.
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
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('sendMessage', () => {
    const conversationId = 'conv-123';
    const senderId = 'user-456';
    const content = 'Hello, world!';

    describe('Success Case', () => {
      it('should successfully send a message when user is a participant', async () => {
        // Arrange
        const mockParticipant = {
          id: 'participant-123',
          conversation_id: conversationId,
          user_id: senderId,
          joined_at: new Date(),
        };

        const mockMessage = {
          id: 'msg-789',
          conversation_id: conversationId,
          sender_id: senderId,
          content,
          created_at: new Date(),
          updated_at: new Date(),
          sender: {
            id: senderId,
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@example.com',
          },
        };

        mockPrismaService.conversationParticipant.findUnique.mockResolvedValue(
          mockParticipant,
        );
        mockPrismaService.message.create.mockResolvedValue(mockMessage);
        mockPrismaService.conversation.update.mockResolvedValue({
          id: conversationId,
          updated_at: new Date(),
        });

        // Act
        const result = await service.sendMessage(
          conversationId,
          senderId,
          content,
        );

        // Assert
        expect(
          mockPrismaService.conversationParticipant.findUnique,
        ).toHaveBeenCalledWith({
          where: {
            conversation_id_user_id: {
              conversation_id: conversationId,
              user_id: senderId,
            },
          },
        });

        expect(mockPrismaService.message.create).toHaveBeenCalledWith({
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

        expect(mockPrismaService.conversation.update).toHaveBeenCalledWith({
          where: { id: conversationId },
          data: { updated_at: expect.any(Date) },
        });

        expect(result).toEqual(mockMessage);
        expect(result.sender.first_name).toBe('John');
        expect(result.sender.last_name).toBe('Doe');
      });

      it('should return message with sender information', async () => {
        // Arrange
        const mockParticipant = {
          id: 'participant-123',
          conversation_id: conversationId,
          user_id: senderId,
          joined_at: new Date(),
        };

        const mockMessage = {
          id: 'msg-789',
          conversation_id: conversationId,
          sender_id: senderId,
          content,
          created_at: new Date(),
          updated_at: new Date(),
          sender: {
            id: senderId,
            first_name: 'Jane',
            last_name: 'Smith',
            email: 'jane@example.com',
          },
        };

        mockPrismaService.conversationParticipant.findUnique.mockResolvedValue(
          mockParticipant,
        );
        mockPrismaService.message.create.mockResolvedValue(mockMessage);
        mockPrismaService.conversation.update.mockResolvedValue({});

        // Act
        const result = await service.sendMessage(
          conversationId,
          senderId,
          content,
        );

        // Assert
        expect(result).toHaveProperty('sender');
        expect(result.sender).toEqual({
          id: senderId,
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'jane@example.com',
        });
      });
    });

    describe('Unauthorized Case', () => {
      it('should throw ForbiddenException when user is not a participant', async () => {
        // Arrange
        mockPrismaService.conversationParticipant.findUnique.mockResolvedValue(
          null,
        );

        // Act & Assert
        await expect(
          service.sendMessage(conversationId, senderId, content),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          service.sendMessage(conversationId, senderId, content),
        ).rejects.toThrow('You are not a member of this conversation');

        // Verify message.create was NOT called
        expect(mockPrismaService.message.create).not.toHaveBeenCalled();

        // Verify conversation.update was NOT called
        expect(mockPrismaService.conversation.update).not.toHaveBeenCalled();
      });

      it('should not create message when participant lookup fails', async () => {
        // Arrange
        mockPrismaService.conversationParticipant.findUnique.mockResolvedValue(
          null,
        );

        // Act & Assert
        try {
          await service.sendMessage(conversationId, senderId, content);
          fail('Should have thrown ForbiddenException');
        } catch (error) {
          expect(error).toBeInstanceOf(ForbiddenException);
          expect(mockPrismaService.message.create).not.toHaveBeenCalled();
        }
      });
    });
  });

  describe('getConversationMessages', () => {
    const conversationId = 'conv-123';
    const userId = 'user-456';

    it('should fetch messages when user is a participant', async () => {
      // Arrange
      const mockParticipant = {
        id: 'participant-123',
        conversation_id: conversationId,
        user_id: userId,
        joined_at: new Date(),
      };

      const mockMessages = [
        {
          id: 'msg-1',
          conversation_id: conversationId,
          sender_id: 'user-111',
          content: 'First message',
          created_at: new Date(),
          updated_at: new Date(),
          sender: {
            id: 'user-111',
            first_name: 'Alice',
            last_name: 'Johnson',
            email: 'alice@example.com',
          },
        },
        {
          id: 'msg-2',
          conversation_id: conversationId,
          sender_id: userId,
          content: 'Second message',
          created_at: new Date(),
          updated_at: new Date(),
          sender: {
            id: userId,
            first_name: 'Bob',
            last_name: 'Smith',
            email: 'bob@example.com',
          },
        },
      ];

      mockPrismaService.conversationParticipant.findUnique.mockResolvedValue(
        mockParticipant,
      );
      mockPrismaService.message.findMany.mockResolvedValue(mockMessages);

      // Act
      const result = await service.getConversationMessages(
        conversationId,
        userId,
      );

      // Assert
      expect(
        mockPrismaService.conversationParticipant.findUnique,
      ).toHaveBeenCalledWith({
        where: {
          conversation_id_user_id: {
            conversation_id: conversationId,
            user_id: userId,
          },
        },
      });

      expect(mockPrismaService.message.findMany).toHaveBeenCalledWith({
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

      expect(result).toEqual(mockMessages);
      expect(result).toHaveLength(2);
    });

    it('should throw ForbiddenException when user is not a participant', async () => {
      // Arrange
      mockPrismaService.conversationParticipant.findUnique.mockResolvedValue(
        null,
      );

      // Act & Assert
      await expect(
        service.getConversationMessages(conversationId, userId),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.message.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getConversation', () => {
    const conversationId = 'conv-123';
    const userId = 'user-456';

    it('should return conversation when user is a participant', async () => {
      // Arrange
      const mockConversation = {
        id: conversationId,
        organization_id: 'org-123',
        is_group: true,
        name: 'Test Group',
        created_at: new Date(),
        updated_at: new Date(),
        participants: [
          {
            id: 'participant-1',
            conversation_id: conversationId,
            user_id: userId,
            joined_at: new Date(),
            user: {
              id: userId,
              first_name: 'John',
              last_name: 'Doe',
              email: 'john@example.com',
            },
          },
          {
            id: 'participant-2',
            conversation_id: conversationId,
            user_id: 'user-789',
            joined_at: new Date(),
            user: {
              id: 'user-789',
              first_name: 'Jane',
              last_name: 'Smith',
              email: 'jane@example.com',
            },
          },
        ],
      };

      mockPrismaService.conversation.findUnique.mockResolvedValue(
        mockConversation,
      );

      // Act
      const result = await service.getConversation(conversationId, userId);

      // Assert
      expect(mockPrismaService.conversation.findUnique).toHaveBeenCalledWith({
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

      expect(result).toEqual(mockConversation);
      expect(result.participants).toHaveLength(2);
    });

    it('should throw NotFoundException when conversation does not exist', async () => {
      // Arrange
      mockPrismaService.conversation.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.getConversation(conversationId, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not a participant', async () => {
      // Arrange
      const mockConversation = {
        id: conversationId,
        organization_id: 'org-123',
        is_group: true,
        name: 'Test Group',
        created_at: new Date(),
        updated_at: new Date(),
        participants: [
          {
            id: 'participant-1',
            conversation_id: conversationId,
            user_id: 'user-999',
            joined_at: new Date(),
            user: {
              id: 'user-999',
              first_name: 'Alice',
              last_name: 'Johnson',
              email: 'alice@example.com',
            },
          },
        ],
      };

      mockPrismaService.conversation.findUnique.mockResolvedValue(
        mockConversation,
      );

      // Act & Assert
      await expect(
        service.getConversation(conversationId, userId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createConversation', () => {
    const orgId = 'org-123';
    const currentUserId = 'user-1';
    const targetUserId = 'user-2';

    beforeEach(() => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: targetUserId,
        first_name: 'User',
        last_name: 'Two',
        email: 'user2@example.com',
      });
    });

    it('should create a new 1-on-1 conversation', async () => {
      // Arrange
      const mockConversation = {
        id: 'conv-new',
        organization_id: orgId,
        is_group: false,
        name: null,
        created_at: new Date(),
        updated_at: new Date(),
        participants: [
          {
            id: 'participant-1',
            conversation_id: 'conv-new',
            user_id: currentUserId,
            joined_at: new Date(),
            user: {
              id: currentUserId,
              first_name: 'User',
              last_name: 'One',
              email: 'user1@example.com',
            },
          },
          {
            id: 'participant-2',
            conversation_id: 'conv-new',
            user_id: targetUserId,
            joined_at: new Date(),
            user: {
              id: targetUserId,
              first_name: 'User',
              last_name: 'Two',
              email: 'user2@example.com',
            },
          },
        ],
      };

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: targetUserId,
        first_name: 'User',
        last_name: 'Two',
        email: 'user2@example.com',
      });

      mockPrismaService.conversation.findFirst.mockResolvedValue(null);

      // Mock conversation.create to return an object with id
      mockPrismaService.conversation.create.mockResolvedValue({
        id: 'conv-new',
      });

      // Mock conversation.findUnique to return the full conversation with participants
      mockPrismaService.conversation.findUnique.mockResolvedValue(
        mockConversation,
      );

      // Act
      const result = await service.createConversation(
        orgId,
        currentUserId,
        targetUserId,
      );

      // Assert
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: targetUserId },
      });
      expect(result).toBeDefined();
      expect(result!.is_group).toBe(false);
      expect(result!.participants).toHaveLength(2);
    });

    it('should return existing conversation if found', async () => {
      // Arrange
      const existingConversation = {
        id: 'conv-existing',
        organization_id: orgId,
        is_group: false,
        name: null,
        created_at: new Date(),
        updated_at: new Date(),
        participants: [
          {
            id: 'participant-1',
            conversation_id: 'conv-existing',
            user_id: currentUserId,
            joined_at: new Date(),
            user: {
              id: currentUserId,
              first_name: 'User',
              last_name: 'One',
              email: 'user1@example.com',
            },
          },
          {
            id: 'participant-2',
            conversation_id: 'conv-existing',
            user_id: targetUserId,
            joined_at: new Date(),
            user: {
              id: targetUserId,
              first_name: 'User',
              last_name: 'Two',
              email: 'user2@example.com',
            },
          },
        ],
      };

      mockPrismaService.conversation.findFirst.mockResolvedValue(
        existingConversation,
      );

      // Act
      const result = await service.createConversation(
        orgId,
        currentUserId,
        targetUserId,
      );

      // Assert
      expect(result).toBeDefined();
      expect(result!.is_group).toBe(false);
      expect(result!.participants).toHaveLength(2);
    });

    it('should throw ForbiddenException when target user is outside tenant scope', async () => {
      mockPrismaService.organizationMembership.findMany.mockResolvedValueOnce([
        { user_id: currentUserId },
      ]);

      await expect(
        service.createConversation(orgId, currentUserId, targetUserId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getUserConversations', () => {
    const userId = 'user-456';
    const orgId = 'org-123';

    it('should fetch all user conversations ordered by most recent', async () => {
      // Arrange
      const mockConversations = [
        {
          id: 'conv-1',
          organization_id: orgId,
          is_group: true,
          name: 'Recent Chat',
          created_at: new Date('2026-03-26'),
          updated_at: new Date('2026-03-26T20:00:00Z'),
          messages: [
            {
              id: 'msg-1',
              conversation_id: 'conv-1',
              sender_id: 'user-999',
              content: 'Latest message',
              created_at: new Date('2026-03-26T20:00:00Z'),
              updated_at: new Date('2026-03-26T20:00:00Z'),
              sender: {
                id: 'user-999',
                first_name: 'Alice',
                last_name: 'Johnson',
                email: 'alice@example.com',
              },
            },
          ],
          participants: [
            {
              id: 'participant-1',
              conversation_id: 'conv-1',
              user_id: userId,
              joined_at: new Date(),
              user: {
                id: userId,
                first_name: 'John',
                last_name: 'Doe',
                email: 'john@example.com',
              },
            },
          ],
        },
      ];

      mockPrismaService.conversation.findMany.mockResolvedValue(
        mockConversations,
      );

      // Act
      const result = await service.getUserConversations(userId, orgId);

      // Assert
      expect(mockPrismaService.conversation.findMany).toHaveBeenCalledWith({
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

      expect(result).toEqual(mockConversations);
      expect(result[0].messages).toHaveLength(1);
    });

    it('should return empty array when user has no conversations', async () => {
      // Arrange
      mockPrismaService.conversation.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getUserConversations(userId, orgId);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('createGroupConversation', () => {
    const orgId = 'org-123';
    const creatorId = 'creator-user-id';
    const participantIds = ['participant1', 'participant2', 'participant3'];
    const groupName = 'Test Group Chat';

    it('should create a new group conversation with all participants', async () => {
      // Arrange
      const mockGroupConversation = {
        id: 'group-conv-123',
        organization_id: orgId,
        is_group: true,
        name: groupName,
        participants: [
          {
            conversation_id: 'group-conv-123',
            user_id: creatorId,
            user: {
              id: creatorId,
              first_name: 'Creator',
              last_name: 'User',
              email: 'creator@example.com',
            },
          },
          {
            conversation_id: 'group-conv-123',
            user_id: 'participant1',
            user: {
              id: 'participant1',
              first_name: 'Participant',
              last_name: 'One',
              email: 'p1@example.com',
            },
          },
          {
            conversation_id: 'group-conv-123',
            user_id: 'participant2',
            user: {
              id: 'participant2',
              first_name: 'Participant',
              last_name: 'Two',
              email: 'p2@example.com',
            },
          },
          {
            conversation_id: 'group-conv-123',
            user_id: 'participant3',
            user: {
              id: 'participant3',
              first_name: 'Participant',
              last_name: 'Three',
              email: 'p3@example.com',
            },
          },
        ],
        messages: [],
      };

      // Mock user.findMany to verify all participants exist
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: creatorId },
        { id: 'participant1' },
        { id: 'participant2' },
        { id: 'participant3' },
      ]);

      mockPrismaService.conversation.create.mockResolvedValue({
        id: 'group-conv-123',
        organization_id: orgId,
        is_group: true,
        name: groupName,
      });

      mockPrismaService.conversationParticipant.createMany.mockResolvedValue({
        count: 4,
      });

      mockPrismaService.conversation.findUnique.mockResolvedValue(
        mockGroupConversation,
      );

      // Act
      const result = await service.createGroupConversation(
        orgId,
        creatorId,
        groupName,
        participantIds,
      );

      // Assert
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: [creatorId, ...participantIds],
          },
        },
        select: { id: true },
      });
      expect(mockPrismaService.conversation.create).toHaveBeenCalled();
      expect(
        mockPrismaService.conversationParticipant.createMany,
      ).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result!.is_group).toBe(true);
      expect(result!.name).toBe(groupName);
      expect(result!.participants).toHaveLength(4);
    });

    it('should throw BadRequestException when no participants are provided', async () => {
      // Arrange & Act & Assert
      await expect(
        service.createGroupConversation(orgId, creatorId, groupName, []),
      ).rejects.toThrow(
        'At least one participant must be included in a group conversation',
      );
    });

    it('should throw NotFoundException when one or more participants do not exist', async () => {
      // Arrange
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: creatorId },
        { id: 'participant1' },
        // Missing participant2 and participant3
      ]);

      // Act & Assert
      await expect(
        service.createGroupConversation(
          orgId,
          creatorId,
          groupName,
          participantIds,
        ),
      ).rejects.toThrow('One or more participants do not exist');
    });

    it('should throw ForbiddenException when a participant is outside tenant scope', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: creatorId },
        { id: 'participant1' },
      ]);
      mockPrismaService.organizationMembership.findMany.mockResolvedValueOnce([
        { user_id: creatorId },
      ]);

      await expect(
        service.createGroupConversation(orgId, creatorId, groupName, [
          'participant1',
        ]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should include creator in the participants list', async () => {
      // Arrange
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: creatorId },
        { id: 'participant1' },
      ]);

      mockPrismaService.conversation.create.mockResolvedValue({
        id: 'group-conv-456',
        organization_id: orgId,
        is_group: true,
        name: groupName,
      });

      mockPrismaService.conversationParticipant.createMany.mockResolvedValue({
        count: 2,
      });

      mockPrismaService.conversation.findUnique.mockResolvedValue({
        id: 'group-conv-456',
        organization_id: orgId,
        is_group: true,
        name: groupName,
        participants: [
          {
            conversation_id: 'group-conv-456',
            user_id: creatorId,
            user: {
              id: creatorId,
              first_name: 'Creator',
              last_name: 'User',
              email: 'creator@example.com',
            },
          },
          {
            conversation_id: 'group-conv-456',
            user_id: 'participant1',
            user: {
              id: 'participant1',
              first_name: 'P',
              last_name: '1',
              email: 'p1@example.com',
            },
          },
        ],
        messages: [],
      });

      // Act
      const result = await service.createGroupConversation(
        orgId,
        creatorId,
        groupName,
        ['participant1'],
      );

      // Assert
      // Verify the participants array includes the creator
      expect(result!.participants.map((p) => p.user_id)).toContain(creatorId);
      expect(
        mockPrismaService.conversationParticipant.createMany,
      ).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            user_id: creatorId,
          }),
        ]),
      });
    });
  });
});
