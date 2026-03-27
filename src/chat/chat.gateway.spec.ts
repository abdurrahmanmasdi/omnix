/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { Server } from 'socket.io';

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let jwtService: JwtService;
  let mockServer: Partial<Server>;
  let mockSocket: any;

  const mockChatService = {
    sendMessage: jest.fn(),
    getConversation: jest.fn(),
    getUserConversations: jest.fn(),
    getConversationMessages: jest.fn(),
    createConversation: jest.fn(),
  };

  const mockJwtService = {
    verify: jest.fn(),
    sign: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create a fake Server object with mocked methods
    const toChain = {
      emit: jest.fn().mockReturnValue(undefined),
    };

    mockServer = {
      to: jest.fn().mockReturnValue(toChain),
      emit: jest.fn(),
    };

    // Create a fake Socket object with necessary methods and properties
    mockSocket = {
      id: 'socket-123',
      data: {},
      disconnect: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      handshake: {
        auth: {} as any,
        headers: {} as any,
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        {
          provide: ChatService,
          useValue: mockChatService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
    jwtService = module.get<JwtService>(JwtService);

    // Attach the mock server to the gateway
    gateway.server = mockServer as Server;
  });

  describe('handleConnection', () => {
    const validToken = 'valid-jwt-token';
    const userId = 'user-456';
    const orgId = 'org-123';
    const validPayload = { sub: userId };

    describe('Success Case', () => {
      it('should authenticate client with valid token from handshake.auth', async () => {
        // Arrange
        mockSocket.handshake.auth.token = validToken;
        mockSocket.handshake.headers['x-organization-id'] = orgId;
        mockJwtService.verify.mockReturnValue(validPayload);

        // Act
        await gateway.handleConnection(mockSocket);

        // Assert
        expect(mockJwtService.verify).toHaveBeenCalledWith(validToken);
        expect(mockSocket.data.userId).toBe(userId);
        expect(mockSocket.data.orgId).toBe(orgId);
        expect(mockSocket.disconnect).not.toHaveBeenCalled();
      });

      it('should authenticate client with token from Authorization header', async () => {
        // Arrange
        mockSocket.handshake.headers.authorization = `Bearer ${validToken}`;
        mockSocket.handshake.headers['x-organization-id'] = orgId;
        mockJwtService.verify.mockReturnValue(validPayload);

        // Act
        await gateway.handleConnection(mockSocket);

        // Assert
        expect(mockJwtService.verify).toHaveBeenCalledWith(validToken);
        expect(mockSocket.data.userId).toBe(userId);
        expect(mockSocket.data.orgId).toBe(orgId);
        expect(mockSocket.disconnect).not.toHaveBeenCalled();
      });

      it('should accept organization ID from handshake.auth if available', async () => {
        // Arrange
        mockSocket.handshake.auth.token = validToken;
        mockSocket.handshake.auth.orgId = orgId;
        mockJwtService.verify.mockReturnValue(validPayload);

        // Act
        await gateway.handleConnection(mockSocket);

        // Assert
        expect(mockSocket.data.orgId).toBe(orgId);
      });
    });

    describe('Failure Cases', () => {
      it('should disconnect client when no token is provided', async () => {
        // Arrange
        mockSocket.handshake.auth = {};
        mockSocket.handshake.headers = {};

        // Act
        await gateway.handleConnection(mockSocket);

        // Assert
        expect(mockSocket.disconnect).toHaveBeenCalled();
        /* eslint-disable-next-line @typescript-eslint/unbound-method */
        expect(jwtService.verify).not.toHaveBeenCalled();
      });

      it('should disconnect client when token verification fails', async () => {
        // Arrange
        mockSocket.handshake.auth.token = 'invalid-token';
        mockSocket.handshake.headers['x-organization-id'] = orgId;
        mockJwtService.verify.mockImplementation(() => {
          throw new UnauthorizedException('Invalid token');
        });

        // Act
        await gateway.handleConnection(mockSocket);

        // Assert
        expect(mockJwtService.verify).toHaveBeenCalledWith('invalid-token');
        expect(mockSocket.disconnect).toHaveBeenCalled();
        expect(mockSocket.data.userId).toBeUndefined();
      });

      it('should disconnect client when token payload has no sub (userId)', async () => {
        // Arrange
        mockSocket.handshake.auth.token = validToken;
        mockSocket.handshake.headers['x-organization-id'] = orgId;
        mockJwtService.verify.mockReturnValue({}); // No 'sub' field

        // Act
        await gateway.handleConnection(mockSocket);

        // Assert
        expect(mockSocket.disconnect).toHaveBeenCalled();
      });

      it('should disconnect client when no organization ID is provided', async () => {
        // Arrange
        mockSocket.handshake.auth = { token: validToken };
        mockSocket.handshake.headers = {};
        mockJwtService.verify.mockReturnValue(validPayload);

        // Act
        await gateway.handleConnection(mockSocket);

        // Assert
        expect(mockJwtService.verify).toHaveBeenCalled();
        expect(mockSocket.disconnect).toHaveBeenCalled();
        expect(mockSocket.data.userId).toBeUndefined(); // Not set because org check failed before assignment
      });
    });
  });

  describe('handleSendMessage', () => {
    const conversationId = 'conv-123';
    const userId = 'user-456';
    const content = 'Hello, everyone!';

    beforeEach(() => {
      // Setup authenticated socket
      mockSocket.data.userId = userId;
      mockSocket.data.orgId = 'org-123';
    });

    describe('Success Case', () => {
      it('should send message and broadcast to conversation room', async () => {
        // Arrange
        const payload = { conversationId, content };
        const mockSavedMessage = {
          id: 'msg-789',
          conversation_id: conversationId,
          sender_id: userId,
          content,
          created_at: new Date(),
          updated_at: new Date(),
          sender: {
            id: userId,
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@example.com',
          },
        };

        mockChatService.sendMessage.mockResolvedValue(mockSavedMessage);

        // Act
        await gateway.handleSendMessage(mockSocket, payload);

        // Assert
        expect(mockChatService.sendMessage).toHaveBeenCalledWith(
          conversationId,
          userId,
          content,
        );

        // Verify broadcasting to room
        expect(mockServer.to).toHaveBeenCalledWith(conversationId);
        const toChain = (mockServer.to as jest.Mock).mock.results[0].value;
        expect(toChain.emit).toHaveBeenCalledWith(
          'new_message',
          mockSavedMessage,
        );
      });

      it('should include sender information in broadcasted message', async () => {
        // Arrange
        const payload = { conversationId, content };
        const mockSavedMessage = {
          id: 'msg-789',
          conversation_id: conversationId,
          sender_id: userId,
          content: 'Test message',
          created_at: new Date(),
          updated_at: new Date(),
          sender: {
            id: userId,
            first_name: 'Jane',
            last_name: 'Smith',
            email: 'jane@example.com',
          },
        };

        mockChatService.sendMessage.mockResolvedValue(mockSavedMessage);

        // Act
        await gateway.handleSendMessage(mockSocket, payload);

        // Assert
        const toChain = (mockServer.to as jest.Mock).mock.results[0].value;
        const emittedMessage = (toChain.emit as jest.Mock).mock.calls[0][1];

        expect(emittedMessage.sender.first_name).toBe('Jane');
        expect(emittedMessage.sender.last_name).toBe('Smith');
      });
    });

    describe('Failure Cases', () => {
      it('should send error event when message content is empty', async () => {
        // Arrange
        const payload = { conversationId, content: '   ' }; // Empty/whitespace content

        // Act
        await gateway.handleSendMessage(mockSocket, payload);

        // Assert
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          message: 'Message content cannot be empty',
        });
        expect(mockChatService.sendMessage).not.toHaveBeenCalled();
        expect(mockServer.to).not.toHaveBeenCalled();
      });

      it('should send error event when user is not a conversation member', async () => {
        // Arrange
        const payload = { conversationId, content };
        mockChatService.sendMessage.mockRejectedValue(
          new ForbiddenException('You are not a member of this conversation'),
        );

        // Act
        await gateway.handleSendMessage(mockSocket, payload);

        // Assert
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          message: 'You are not a member of this conversation',
        });
        expect(mockServer.to).not.toHaveBeenCalled();
      });

      it('should send generic error when chatService throws unexpected error', async () => {
        // Arrange
        const payload = { conversationId, content };
        mockChatService.sendMessage.mockRejectedValue(
          new Error('Database connection error'),
        );

        // Act
        await gateway.handleSendMessage(mockSocket, payload);

        // Assert
        expect(mockSocket.emit).toHaveBeenCalledWith(
          'error',
          expect.objectContaining({
            message: 'Failed to send message',
            error: 'Database connection error',
          }),
        );
        expect(mockServer.to).not.toHaveBeenCalled();
      });
    });
  });

  describe('handleJoinConversation', () => {
    const conversationId = 'conv-123';
    const userId = 'user-456';

    beforeEach(() => {
      mockSocket.data.userId = userId;
      mockSocket.data.orgId = 'org-123';
    });

    describe('Success Case', () => {
      it('should join conversation room when user is a valid participant', async () => {
        // Arrange
        const payload = { conversationId };
        const mockConversation = {
          id: conversationId,
          organization_id: 'org-123',
          is_group: true,
          name: 'Test Group',
          created_at: new Date(),
          updated_at: new Date(),
          participants: [],
        };

        mockChatService.getConversation.mockResolvedValue(mockConversation);

        // Act
        await gateway.handleJoinConversation(mockSocket, payload);

        // Assert
        expect(mockChatService.getConversation).toHaveBeenCalledWith(
          conversationId,
          userId,
        );
        expect(mockSocket.join).toHaveBeenCalledWith(conversationId);
      });

      it('should broadcast user_joined event to room', async () => {
        // Arrange
        const payload = { conversationId };
        const mockConversation = {
          id: conversationId,
          organization_id: 'org-123',
          is_group: true,
          name: 'Test Group',
          created_at: new Date(),
          updated_at: new Date(),
          participants: [],
        };

        mockChatService.getConversation.mockResolvedValue(mockConversation);

        // Act
        await gateway.handleJoinConversation(mockSocket, payload);

        // Assert
        expect(mockServer.to).toHaveBeenCalledWith(conversationId);
        const toChain = (mockServer.to as jest.Mock).mock.results[0].value;
        expect(toChain.emit).toHaveBeenCalledWith(
          'user_joined',
          expect.objectContaining({
            userId,
            conversationId,
          }),
        );
      });
    });

    describe('Failure Case', () => {
      it('should send error event when user is not a conversation member', async () => {
        // Arrange
        const payload = { conversationId };
        mockChatService.getConversation.mockRejectedValue(
          new ForbiddenException('You are not a member of this conversation'),
        );

        // Act
        await gateway.handleJoinConversation(mockSocket, payload);

        // Assert
        expect(mockSocket.emit).toHaveBeenCalledWith(
          'error',
          expect.objectContaining({
            message: 'Failed to join conversation',
          }),
        );
        expect(mockSocket.join).not.toHaveBeenCalled();
      });
    });
  });

  describe('handleLeaveConversation', () => {
    const conversationId = 'conv-123';
    const userId = 'user-456';

    beforeEach(() => {
      mockSocket.data.userId = userId;
      mockSocket.data.orgId = 'org-123';
    });

    describe('Success Case', () => {
      it('should leave conversation room and broadcast user_left event', () => {
        // Arrange
        const payload = { conversationId };

        // Act
        gateway.handleLeaveConversation(mockSocket, payload);

        // Assert
        expect(mockSocket.leave).toHaveBeenCalledWith(conversationId);
        expect(mockServer.to).toHaveBeenCalledWith(conversationId);
        const toChain = (mockServer.to as jest.Mock).mock.results[0].value;
        expect(toChain.emit).toHaveBeenCalledWith(
          'user_left',
          expect.objectContaining({
            userId,
            conversationId,
          }),
        );
      });
    });
  });

  describe('handleDisconnect', () => {
    it('should log client disconnection', () => {
      // Arrange
      const loggerSpy = jest.spyOn(gateway['logger'], 'log');

      // Act
      gateway.handleDisconnect(mockSocket);

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith(
        `[ChatGateway] Client disconnected: ${mockSocket.id}`,
      );

      loggerSpy.mockRestore();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete flow: connect -> join -> send message -> leave', async () => {
      // Arrange
      const conversationId = 'conv-123';
      const userId = 'user-456';
      const orgId = 'org-123';
      const validToken = 'valid-jwt-token';

      // Setup authentication
      mockSocket.handshake.auth.token = validToken;
      mockSocket.handshake.headers['x-organization-id'] = orgId;
      mockJwtService.verify.mockReturnValue({ sub: userId });

      const mockConversation = {
        id: conversationId,
        organization_id: orgId,
        is_group: true,
        name: 'Test Group',
        created_at: new Date(),
        updated_at: new Date(),
        participants: [],
      };

      const mockMessage = {
        id: 'msg-789',
        conversation_id: conversationId,
        sender_id: userId,
        content: 'Hello!',
        created_at: new Date(),
        updated_at: new Date(),
        sender: {
          id: userId,
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
        },
      };

      mockChatService.getConversation.mockResolvedValue(mockConversation);
      mockChatService.sendMessage.mockResolvedValue(mockMessage);

      // Act 1: Connect
      await gateway.handleConnection(mockSocket);
      expect(mockSocket.data.userId).toBe(userId);

      // Act 2: Join conversation
      await gateway.handleJoinConversation(mockSocket, { conversationId });
      expect(mockSocket.join).toHaveBeenCalledWith(conversationId);

      // Act 3: Send message
      await gateway.handleSendMessage(mockSocket, {
        conversationId,
        content: 'Hello!',
      });
      expect(mockChatService.sendMessage).toHaveBeenCalledWith(
        conversationId,
        userId,
        'Hello!',
      );

      // Act 4: Leave conversation
      gateway.handleLeaveConversation(mockSocket, { conversationId });
      expect(mockSocket.leave).toHaveBeenCalledWith(conversationId);

      // Assert: All operations succeeded without errors
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        'error',
        expect.any(Object),
      );
    });
  });
});
