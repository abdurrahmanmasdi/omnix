/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  THROTTLER_LIMIT,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

type MockSocket = {
  id: string;
  data: Record<string, unknown>;
  disconnect: jest.Mock;
  join: jest.Mock;
  leave: jest.Mock;
  emit: jest.Mock;
  handshake: {
    auth: Record<string, unknown>;
    headers: Record<string, unknown>;
  };
};

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let mockSocket: MockSocket;

  const roomEmitter = {
    emit: jest.fn(),
  };

  const mockServer = {
    to: jest.fn().mockReturnValue(roomEmitter),
    emit: jest.fn(),
  };

  const mockJwtService = {
    verifyAsync: jest.fn(),
  };

  const mockChatService = {
    sendMessage: jest.fn(),
    getConversation: jest.fn(),
    getConversationMessages: jest.fn(),
    getUserConversations: jest.fn(),
    createConversation: jest.fn(),
    createGroupConversation: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSocket = {
      id: 'socket-123',
      data: {},
      disconnect: jest.fn(),
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      handshake: {
        auth: {},
        headers: {},
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            ttl: 60000,
            limit: 20,
          },
        ]),
      ],
      providers: [
        ChatGateway,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ChatService,
          useValue: mockChatService,
        },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
    gateway.server = mockServer as any;
  });

  describe('security decorators', () => {
    it('applies ThrottlerGuard and throttle config to send_message handler', () => {
      const handler = ChatGateway.prototype.handleSendMessage as any;

      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as any[];
      const limit = Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler);
      const ttl = Reflect.getMetadata(`${THROTTLER_TTL}default`, handler);

      expect(guards).toContain(ThrottlerGuard);
      expect(limit).toBe(20);
      expect(ttl).toBe(60000);
    });
  });

  describe('handleConnection', () => {
    const userId = 'user-1';
    const orgId = 'org-1';

    it('authenticates from handshake auth token, stores identity, and joins org room', async () => {
      mockSocket.handshake.auth.token = 'Bearer jwt-token';
      mockJwtService.verifyAsync.mockResolvedValue({ sub: userId, orgId });

      await gateway.handleConnection(mockSocket as any);

      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('jwt-token');
      expect(mockSocket.data.userId).toBe(userId);
      expect(mockSocket.data.orgId).toBe(orgId);
      expect(mockSocket.join).toHaveBeenCalledWith(`org:${orgId}`);
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });

    it('authenticates from authorization header and org id header fallback', async () => {
      mockSocket.handshake.headers.authorization = 'Bearer header-token';
      mockSocket.handshake.headers['x-organization-id'] = orgId;
      mockJwtService.verifyAsync.mockResolvedValue({ sub: userId });

      await gateway.handleConnection(mockSocket as any);

      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('header-token');
      expect(mockSocket.join).toHaveBeenCalledWith(`org:${orgId}`);
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects when token is missing', async () => {
      await gateway.handleConnection(mockSocket as any);

      expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects when token is expired', async () => {
      mockSocket.handshake.auth.token = 'expired-token';
      mockJwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await gateway.handleConnection(mockSocket as any);

      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('expired-token');
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects when payload has no sub', async () => {
      mockSocket.handshake.auth.token = 'jwt-token';
      mockJwtService.verifyAsync.mockResolvedValue({ orgId });

      await gateway.handleConnection(mockSocket as any);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects when org id is absent in payload, auth, and headers', async () => {
      mockSocket.handshake.auth.token = 'jwt-token';
      mockJwtService.verifyAsync.mockResolvedValue({ sub: userId });

      await gateway.handleConnection(mockSocket as any);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('does not make membership database checks during connection', async () => {
      mockSocket.handshake.auth.token = 'Bearer jwt-token';
      mockJwtService.verifyAsync.mockResolvedValue({ sub: userId, orgId });

      await gateway.handleConnection(mockSocket as any);

      expect(mockChatService.getConversation).not.toHaveBeenCalled();
      expect(mockChatService.getConversationMessages).not.toHaveBeenCalled();
      expect(mockSocket.join).toHaveBeenCalledWith(`org:${orgId}`);
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('handleJoinConversation', () => {
    const userId = 'user-1';
    const orgId = 'org-1';
    const conversationId = 'conv-1';

    beforeEach(() => {
      mockSocket.data.userId = userId;
      mockSocket.data.orgId = orgId;
    });

    it('joins room and emits user_joined when conversation is in same tenant', async () => {
      mockChatService.getConversation.mockResolvedValue({
        id: conversationId,
        organization_id: orgId,
      });

      await gateway.handleJoinConversation(mockSocket as any, {
        conversationId,
      });

      expect(mockChatService.getConversation).toHaveBeenCalledWith(
        conversationId,
        userId,
      );
      expect(mockSocket.join).toHaveBeenCalledWith(conversationId);
      expect(mockServer.to).toHaveBeenCalledWith(conversationId);
      expect(roomEmitter.emit).toHaveBeenCalledWith(
        'user_joined',
        expect.objectContaining({ userId, conversationId }),
      );
    });

    it('rejects when conversation belongs to different organization', async () => {
      mockChatService.getConversation.mockResolvedValue({
        id: conversationId,
        organization_id: 'org-other',
      });

      await gateway.handleJoinConversation(mockSocket as any, {
        conversationId,
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: 'Failed to join conversation' }),
      );
      expect(mockSocket.join).not.toHaveBeenCalled();
    });

    it('rejects when socket identity is missing', async () => {
      mockSocket.data = {};

      await gateway.handleJoinConversation(mockSocket as any, {
        conversationId,
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: 'Failed to join conversation' }),
      );
      expect(mockChatService.getConversation).not.toHaveBeenCalled();
    });
  });

  describe('handleSendMessage', () => {
    const userId = 'user-1';
    const orgId = 'org-1';
    const conversationId = 'conv-1';
    const content = 'hello secure world';

    beforeEach(() => {
      mockSocket.data.userId = userId;
      mockSocket.data.orgId = orgId;
    });

    it('sends and broadcasts message for authorized conversation in tenant scope', async () => {
      const savedMessage = { id: 'msg-1', conversation_id: conversationId };

      mockChatService.getConversation.mockResolvedValue({
        id: conversationId,
        organization_id: orgId,
      });
      mockChatService.sendMessage.mockResolvedValue(savedMessage);

      await gateway.handleSendMessage(mockSocket as any, {
        conversationId,
        content,
      });

      expect(mockChatService.sendMessage).toHaveBeenCalledWith(
        conversationId,
        userId,
        content,
      );
      expect(mockServer.to).toHaveBeenCalledWith(conversationId);
      expect(roomEmitter.emit).toHaveBeenCalledWith(
        'new_message',
        savedMessage,
      );
    });

    it('blocks send when conversation is outside tenant scope', async () => {
      mockChatService.getConversation.mockResolvedValue({
        id: conversationId,
        organization_id: 'org-other',
      });

      await gateway.handleSendMessage(mockSocket as any, {
        conversationId,
        content,
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'You are not a member of this conversation',
      });
      expect(mockChatService.sendMessage).not.toHaveBeenCalled();
    });

    it('returns membership error when ChatService throws ForbiddenException', async () => {
      mockChatService.getConversation.mockResolvedValue({
        id: conversationId,
        organization_id: orgId,
      });
      mockChatService.sendMessage.mockRejectedValue(
        new ForbiddenException('Not allowed'),
      );

      await gateway.handleSendMessage(mockSocket as any, {
        conversationId,
        content,
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'You are not a member of this conversation',
      });
    });

    it('returns generic error for unexpected failures', async () => {
      mockChatService.getConversation.mockResolvedValue({
        id: conversationId,
        organization_id: orgId,
      });
      mockChatService.sendMessage.mockRejectedValue(new Error('db down'));

      await gateway.handleSendMessage(mockSocket as any, {
        conversationId,
        content,
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          message: 'Failed to send message',
          error: 'db down',
        }),
      );
    });

    it('returns membership error when socket identity is missing', async () => {
      mockSocket.data = {};

      await gateway.handleSendMessage(mockSocket as any, {
        conversationId,
        content,
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'You are not a member of this conversation',
      });
      expect(mockChatService.getConversation).not.toHaveBeenCalled();
    });
  });

  describe('handleGetMessages', () => {
    const userId = 'user-1';
    const orgId = 'org-1';
    const conversationId = 'conv-1';

    beforeEach(() => {
      mockSocket.data.userId = userId;
      mockSocket.data.orgId = orgId;
    });

    it('returns conversation messages for valid tenant conversation', async () => {
      const messages = [{ id: 'm1' }, { id: 'm2' }];

      mockChatService.getConversation.mockResolvedValue({
        id: conversationId,
        organization_id: orgId,
      });
      mockChatService.getConversationMessages.mockResolvedValue(messages);

      await gateway.handleGetMessages(mockSocket as any, { conversationId });

      expect(mockChatService.getConversationMessages).toHaveBeenCalledWith(
        conversationId,
        userId,
      );
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'conversation_messages',
        expect.objectContaining({ conversationId, messages }),
      );
    });

    it('returns membership error for tenant mismatch', async () => {
      mockChatService.getConversation.mockResolvedValue({
        id: conversationId,
        organization_id: 'org-other',
      });

      await gateway.handleGetMessages(mockSocket as any, { conversationId });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'You are not a member of this conversation',
      });
      expect(mockChatService.getConversationMessages).not.toHaveBeenCalled();
    });
  });

  describe('handleLeaveConversation', () => {
    it('leaves room and emits user_left when identity exists', () => {
      mockSocket.data.userId = 'user-1';
      mockSocket.data.orgId = 'org-1';

      gateway.handleLeaveConversation(mockSocket as any, {
        conversationId: 'conv-1',
      });

      expect(mockSocket.leave).toHaveBeenCalledWith('conv-1');
      expect(mockServer.to).toHaveBeenCalledWith('conv-1');
      expect(roomEmitter.emit).toHaveBeenCalledWith(
        'user_left',
        expect.objectContaining({
          userId: 'user-1',
          conversationId: 'conv-1',
        }),
      );
    });

    it('does not throw if unauthenticated socket tries to leave', () => {
      mockSocket.data = {};

      expect(() =>
        gateway.handleLeaveConversation(mockSocket as any, {
          conversationId: 'conv-1',
        }),
      ).not.toThrow();
      expect(mockSocket.leave).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('logs disconnection', () => {
      const loggerSpy = jest.spyOn(gateway['logger'], 'log');

      gateway.handleDisconnect(mockSocket as any);

      expect(loggerSpy).toHaveBeenCalledWith(
        `[ChatGateway] Client disconnected: ${mockSocket.id}`,
      );

      loggerSpy.mockRestore();
    });
  });
});
