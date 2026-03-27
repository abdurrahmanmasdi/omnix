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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { MembershipStatus } from '@prisma/client';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ChatService } from './chat.service';
import { UsersService } from '../users/users.service';

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
  };
}

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: '*', // Allow all origins for now (we can lock this down in production)
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
    private readonly usersService: UsersService,
    private readonly chatService: ChatService,
  ) {}

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

  private async isActiveMember(
    userId: string,
    orgId: string,
  ): Promise<boolean> {
    const memberships = await this.usersService.getUserOrganizations(userId);

    return memberships.some(
      (membership) =>
        membership.organization_id === orgId &&
        String(membership.status) === String(MembershipStatus.ACTIVE),
    );
  }

  private getSocketIdentity(client: AuthenticatedSocket): {
    userId: string;
    orgId: string;
  } {
    const userId = client.data.userId;
    const orgId = client.data.orgId;

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

      const payload = this.jwtService.verify<JwtSocketPayload>(token);

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

      const member = await this.isActiveMember(client.data.userId, orgId);
      if (!member) {
        this.logger.warn(
          `[ChatGateway] Unauthorized org access | socket=${client.id} user=${client.data.userId} org=${orgId}`,
        );
        client.disconnect(true);
        return;
      }

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

      // Verify user is a participant in the conversation
      const conversation = await this.chatService.getConversation(
        conversationId,
        userId,
      );

      if (conversation.organization_id !== orgId) {
        throw new ForbiddenException('Conversation is outside tenant scope');
      }

      // Join the socket.io room
      await client.join(conversationId);

      this.logger.log(
        `[ChatGateway] User ${userId} joined conversation ${conversationId}`,
      );

      // Notify others in the room that user joined
      this.server.to(conversationId).emit('user_joined', {
        userId,
        conversationId,
        timestamp: new Date(),
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

      const conversation = await this.chatService.getConversation(
        conversationId,
        userId,
      );
      if (conversation.organization_id !== orgId) {
        throw new ForbiddenException('Conversation is outside tenant scope');
      }

      // Save message to database and validate user is participant
      const savedMessage = await this.chatService.sendMessage(
        conversationId,
        userId,
        content,
      );

      this.logger.log(
        `[ChatGateway] Message sent by ${userId} in conversation ${conversationId}`,
      );

      // Broadcast message to everyone in the room
      this.server.to(conversationId).emit('new_message', savedMessage);
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

      const conversation = await this.chatService.getConversation(
        conversationId,
        userId,
      );
      if (conversation.organization_id !== orgId) {
        throw new ForbiddenException('Conversation is outside tenant scope');
      }

      // Fetch messages from database
      const messages = await this.chatService.getConversationMessages(
        conversationId,
        userId,
      );

      // Send messages back to the requesting client
      client.emit('conversation_messages', {
        conversationId,
        messages,
        timestamp: new Date(),
      });

      this.logger.log(
        `[ChatGateway] Sent ${messages.length} messages to ${userId} for conversation ${conversationId}`,
      );
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
