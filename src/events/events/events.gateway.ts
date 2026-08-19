import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { JwtPayload } from '../../auth/jwt.strategy';

// 🚀 Configure CORS to match your Next.js frontend
@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3001',
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // 1. Extract the token sent by the Next.js client
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('No token provided');

      // 2. Verify the token using your JWT Secret
      const payload: JwtPayload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });

      // 3. Lock them into their specific Clinic's "Room"
      const { organizationId, sub: userId } = payload;
      if (organizationId && userId) {
        // 1. Join Organization Room (Tenant level)
        await client.join(organizationId);
        // 2. Join User Room (Private level)
        await client.join(`user_${userId}`);

        this.logger.log(`Client ${client.id} joined room: ${organizationId}`);
      } else {
        throw new Error('User has no organization');
      }
    } catch (error) {
      this.logger.error(`Socket connection rejected: ${error.message}`);
      client.disconnect(); // Kick them out if authentication fails
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // 🚀 This is the public method our WebhookProcessor will call!
  broadcastNewMessage(organizationId: string, messageData: any) {
    // Emits specifically to the organization's room
    this.server.to(organizationId).emit('onNewMessage', messageData);
  }

  // 🚀 Broadcast CRM state changes (lead updates, pipeline moves)
  broadcastLeadUpdate(organizationId: string, leadData: any) {
    this.server.to(organizationId).emit('onLeadUpdate', leadData);
  }

  // 🚀 Broadcast conversation state changes (AI paused/resumed)
  broadcastConversationUpdate(
    organizationId: string,
    conversationData: any,
  ) {
    this.server
      .to(organizationId)
      .emit('onConversationUpdate', conversationData);
  }
}
