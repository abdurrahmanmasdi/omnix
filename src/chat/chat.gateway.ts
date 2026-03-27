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
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    orgId: string;
  };
}

interface JoinConversationPayload {
  conversationId: string;
}

interface SendMessagePayload {
  conversationId: string;
  content: string;
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
    private jwtService: JwtService,
    private chatService: ChatService,
  ) {}

  /**
   * Handle client connection
   * Authenticate the client using JWT token from handshake
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      // Extract token from handshake.auth or headers
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const token =
        client.handshake.auth.token ||
        client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn(
          `[ChatGateway] Connection attempt without token: ${client.id}`,
        );
        client.disconnect();
        return;
      }

      // Verify JWT token
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment
      const payload = this.jwtService.verify(token);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!payload.sub) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // Extract organization ID from headers or auth
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const orgId =
        client.handshake.headers['x-organization-id'] ||
        client.handshake.auth.orgId;

      if (!orgId) {
        this.logger.warn(
          `[ChatGateway] Connection without organization ID: ${client.id}`,
        );
        client.disconnect();
        return;
      }

      // Attach user and org to client data for later use
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      client.data.userId = payload.sub;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      client.data.orgId = orgId;

      this.logger.log(
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access */
        `[ChatGateway] Client connected: ${client.id} | User: ${payload.sub} | Org: ${orgId}`,
      );
    } catch (error) {
      this.logger.error(
        `[ChatGateway] Authentication failed for ${client.id}: ${error}`,
      );
      client.disconnect();
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
    @MessageBody() payload: JoinConversationPayload,
  ): Promise<void> {
    try {
      const { conversationId } = payload;
      const userId = client.data.userId;

      // Verify user is a participant in the conversation
      await this.chatService.getConversation(conversationId, userId);

      // Join the socket.io room
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      client.join(conversationId);

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
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SendMessagePayload,
  ): Promise<void> {
    try {
      const { conversationId, content } = payload;
      const userId = client.data.userId;

      if (!content || content.trim().length === 0) {
        client.emit('error', { message: 'Message content cannot be empty' });
        return;
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
    @MessageBody() payload: JoinConversationPayload,
  ): void {
    try {
      const { conversationId } = payload;
      const userId = client.data.userId;

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      client.leave(conversationId);

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
    @MessageBody() payload: JoinConversationPayload,
  ): Promise<void> {
    try {
      const { conversationId } = payload;
      const userId = client.data.userId;

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
