import {
  WebSocketGateway,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import {
  Injectable,
  Logger,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Throttle, ThrottlerGuard, SkipThrottle } from '@nestjs/throttler';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ChatService } from './chat.service';
import { RequestContextService } from '../request-context/request-context.service';

interface JwtSocketPayload {
  sub: string;
  orgId?: string;
  organizationId?: string;
}

class ConversationEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  conversationId: string;
}

class SendMessageDto extends ConversationEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content: string;
}

interface AuthenticatedSocket extends Socket {
  data: {
    userId?: string;
    orgId?: string;
    organizationId?: string;
  };
}

const isDevelopmentEnvironment =
  (process.env.NODE_ENV ?? 'development') === 'development';

const developmentCorsOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

const configuredFrontendOrigin = process.env.FRONTEND_URL?.trim();

const chatCorsOrigin = configuredFrontendOrigin
  ? configuredFrontendOrigin
  : isDevelopmentEnvironment
    ? developmentCorsOrigins
    : false;

@SkipThrottle()
@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: chatCorsOrigin,
    credentials: true,
  },
})
@Injectable()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
    private readonly cls: RequestContextService,
  ) {}

  private async runWithTenantContext<T>(
    orgId: string,
    callback: () => Promise<T>,
  ): Promise<T> {
    return this.cls.runWith({ tenantId: orgId }, callback);
  }

  private extractBearerToken(raw: string | undefined): string | null {
    if (!raw) {
      return null;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.toLowerCase().startsWith('bearer ')) {
      const token = trimmed.slice(7).trim();
      return token || null;
    }

    return trimmed;
  }

  private getHandshakeToken(client: Socket): string | null {
    const auth = client.handshake.auth as
      | {
          token?: unknown;
        }
      | undefined;

    const authToken =
      typeof auth?.token === 'string'
        ? this.extractBearerToken(auth.token)
        : null;

    if (authToken) {
      return authToken;
    }

    const authorizationHeader =
      typeof client.handshake.headers.authorization === 'string'
        ? client.handshake.headers.authorization
        : undefined;

    return this.extractBearerToken(authorizationHeader);
  }

  private getOrganizationId(
    client: Socket,
    payload: JwtSocketPayload,
  ): string | null {
    if (typeof payload.orgId === 'string' && payload.orgId.trim()) {
      return payload.orgId;
    }

    if (
      typeof payload.organizationId === 'string' &&
      payload.organizationId.trim()
    ) {
      return payload.organizationId;
    }

    const auth = client.handshake.auth as
      | {
          orgId?: unknown;
          organizationId?: unknown;
        }
      | undefined;

    if (typeof auth?.orgId === 'string' && auth.orgId.trim()) {
      return auth.orgId;
    }

    if (
      typeof auth?.organizationId === 'string' &&
      auth.organizationId.trim()
    ) {
      return auth.organizationId;
    }

    const orgHeader = client.handshake.headers['x-organization-id'];
    if (typeof orgHeader === 'string' && orgHeader.trim()) {
      return orgHeader;
    }

    if (Array.isArray(orgHeader) && orgHeader.length > 0) {
      const firstOrgHeader = orgHeader[0];
      return firstOrgHeader?.trim() ? firstOrgHeader : null;
    }

    return null;
  }

  private getSocketIdentity(client: AuthenticatedSocket): {
    userId: string;
    orgId: string;
  } {
    const userId = client.data.userId;
    const orgId = client.data.orgId ?? client.data.organizationId;

    if (!userId || !orgId) {
      throw new ForbiddenException('Unauthenticated socket context');
    }

    return { userId, orgId };
  }

  /**
   * Handle client connection
   * Authenticate the client using JWT token from handshake,
   * verify active organization membership, then bind secure org room.
   */
  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = this.getHandshakeToken(client);

      if (!token) {
        this.logger.warn(
          `[ChatGateway] Connection attempt without token: ${client.id}`,
        );
        client.disconnect(true);
        return;
      }

      const payload =
        await this.jwtService.verifyAsync<JwtSocketPayload>(token);

      if (!payload?.sub) {
        this.logger.warn(
          `[ChatGateway] Invalid token payload for ${client.id}`,
        );
        client.disconnect(true);
        return;
      }

      const orgId = this.getOrganizationId(client, payload);

      if (!orgId) {
        this.logger.warn(
          `[ChatGateway] Connection without organization ID: ${client.id}`,
        );
        client.disconnect(true);
        return;
      }

      client.data.userId = payload.sub;
      client.data.orgId = orgId;
      client.data.organizationId = orgId;

      await client.join(`org:${orgId}`);

      this.logger.log(
        `[ChatGateway] Client connected: ${client.id} | User: ${client.data.userId} | Org: ${orgId}`,
      );
    } catch (error) {
      this.logger.error(
        `[ChatGateway] Authentication failed for ${client.id}: ${error}`,
      );
      client.disconnect(true);
    }
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(client: Socket): void {
    this.logger.log(`[ChatGateway] Client disconnected: ${client.id}`);
  }

  /**
   * Join a conversation room
   */
  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ConversationEventDto,
  ): Promise<void> {
    try {
      const { conversationId } = payload;
      const { userId, orgId } = this.getSocketIdentity(client);

      await this.runWithTenantContext(orgId, async () => {
        const conversation = await this.chatService.getConversation(
          conversationId,
          userId,
        );

        if (conversation.organization_id !== orgId) {
          throw new ForbiddenException('Conversation is outside tenant scope');
        }

        await client.join(conversationId);

        this.logger.log(
          `[ChatGateway] User ${userId} joined conversation ${conversationId}`,
        );

        this.server.to(conversationId).emit('user_joined', {
          userId,
          conversationId,
          timestamp: new Date(),
        });
      });
    } catch (error) {
      this.logger.error(`[ChatGateway] Failed to join conversation: ${error}`);
      client.emit('error', {
        message: 'Failed to join conversation',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Send a message to a conversation
   */
  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: {
      limit: 20,
      ttl: 60000,
    },
  })
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SendMessageDto,
  ): Promise<void> {
    try {
      const { conversationId, content } = payload;
      const { userId, orgId } = this.getSocketIdentity(client);

      await this.runWithTenantContext(orgId, async () => {
        const conversation = await this.chatService.getConversation(
          conversationId,
          userId,
        );
        if (conversation.organization_id !== orgId) {
          throw new ForbiddenException('Conversation is outside tenant scope');
        }

        const savedMessage = await this.chatService.sendMessage(
          conversationId,
          userId,
          content,
        );

        this.logger.log(
          `[ChatGateway] Message sent by ${userId} in conversation ${conversationId}`,
        );

        this.server.to(conversationId).emit('new_message', savedMessage);
      });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        client.emit('error', {
          message: 'You are not a member of this conversation',
        });
      } else {
        this.logger.error(`[ChatGateway] Failed to send message: ${error}`);
        client.emit('error', {
          message: 'Failed to send message',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Leave a conversation room
   */
  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ConversationEventDto,
  ): void {
    try {
      const { conversationId } = payload;
      const { userId } = this.getSocketIdentity(client);

      void client.leave(conversationId);

      this.logger.log(
        `[ChatGateway] User ${userId} left conversation ${conversationId}`,
      );

      // Notify others in the room that user left

      this.server.to(conversationId).emit('user_left', {
        userId,
        conversationId,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error(`[ChatGateway] Failed to leave conversation: ${error}`);
    }
  }

  /**
   * Get conversation messages
   */
  @SubscribeMessage('get_messages')
  async handleGetMessages(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ConversationEventDto,
  ): Promise<void> {
    try {
      const { conversationId } = payload;
      const { userId, orgId } = this.getSocketIdentity(client);

      await this.runWithTenantContext(orgId, async () => {
        const conversation = await this.chatService.getConversation(
          conversationId,
          userId,
        );
        if (conversation.organization_id !== orgId) {
          throw new ForbiddenException('Conversation is outside tenant scope');
        }

        const messages = await this.chatService.getConversationMessages(
          conversationId,
          userId,
        );

        client.emit('conversation_messages', {
          conversationId,
          messages,
          timestamp: new Date(),
        });

        this.logger.log(
          `[ChatGateway] Sent ${messages.length} messages to ${userId} for conversation ${conversationId}`,
        );
      });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        client.emit('error', {
          message: 'You are not a member of this conversation',
        });
      } else {
        this.logger.error(`[ChatGateway] Failed to fetch messages: ${error}`);
        client.emit('error', {
          message: 'Failed to fetch messages',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }
}
