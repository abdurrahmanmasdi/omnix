import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import type { JwtPayload } from '../../auth/jwt.strategy';
import { PermissionService } from '../../auth/permission.service';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantStorage } from '../../core/tenant/tenant.context';
import {
  toPublicMessageDto,
  toPublicLeadDto,
  toPublicConversationDto,
  toPublicNotificationDto,
} from '../dto/public-events.dto';

const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((o) => o.trim())
  : ['http://localhost:3001'];

@WebSocketGateway({
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
})
export class EventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private revalidationInterval?: NodeJS.Timeout;
  private isRevalidating = false;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaService,
  ) {
    // Schedule bounded revalidation every 30 seconds
    this.revalidationInterval = setInterval(
      () => this.revalidateConnections(),
      30000,
    );
  }

  afterInit(server: Server) {
    server.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) throw new Error('No token provided');

        // Verify token signature and expiry
        const payload: JwtPayload = this.jwtService.verify(token, {
          secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        });

        const {
          organizationId,
          sub: userId,
          roleId,
          exp,
        } = payload as JwtPayload & { exp: number };
        if (!organizationId || !userId || !roleId) {
          throw new Error('User has no organization context');
        }

        // Authorize membership and permissions inside the Tenant Context
        await tenantStorage.run({ organizationId }, async () => {
          const membership = await this.prisma.organizationMembership.findFirst(
            {
              where: {
                userId,
                organizationId,
                roleId,
                status: 'ACTIVE',
                deletedAt: null,
              },
              select: { id: true },
            },
          );

          if (!membership) {
            throw new Error('Invalid or inactive organization membership');
          }

          const hasPermission = await this.permissionService.has(
            userId,
            organizationId,
            'view_conversations',
          );
          if (!hasPermission) {
            throw new Error('Missing view_conversations permission');
          }

          // Store verified data on the client object
          socket.data = {
            userId,
            organizationId,
            roleId,
            membershipId: membership.id,
            tokenExp: exp,
          };
        });

        next();
      } catch (error: any) {
        this.logger.error(`Socket handshake rejected: ${error.message}`);
        next(new Error('UnauthorizedException'));
      }
    });
  }

  async handleConnection(client: Socket) {
    const { userId, organizationId } = client.data;
    if (userId && organizationId) {
      await client.join(organizationId);
      await client.join(`user_${userId}`);
      this.logger.log(`Client ${client.id} joined org ${organizationId}`);
    } else {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    client.data = {};
  }

  onModuleDestroy() {
    if (this.revalidationInterval) {
      clearInterval(this.revalidationInterval);
    }
    this.server.disconnectSockets(true);
  }

  private async revalidateConnections() {
    if (this.isRevalidating) return;
    this.isRevalidating = true;

    try {
      const sockets = await this.server.fetchSockets();
      const now = Math.floor(Date.now() / 1000);

      for (const socket of sockets) {
        const { userId, organizationId, roleId, tokenExp } = socket.data;
        if (!userId || !organizationId) continue;

        // 1. Check token expiry
        if (tokenExp && tokenExp < now) {
          this.logger.warn(`Disconnecting ${socket.id} due to token expiry`);
          socket.disconnect(true);
          continue;
        }

        // 2. Revalidate DB membership and permissions inside the Tenant Context
        try {
          await tenantStorage.run({ organizationId }, async () => {
            const membership =
              await this.prisma.organizationMembership.findFirst({
                where: {
                  userId,
                  organizationId,
                  roleId,
                  status: 'ACTIVE',
                  deletedAt: null,
                },
              });

            if (!membership)
              throw new Error('Membership inactive or role changed');

            const hasPermission = await this.permissionService.has(
              userId,
              organizationId,
              'view_conversations',
            );
            if (!hasPermission) throw new Error('Permission revoked');
          });
        } catch (error: any) {
          this.logger.warn(
            `Disconnecting ${socket.id} due to revalidation failure: ${error.message}`,
          );
          socket.disconnect(true);
        }
      }
    } catch (err) {
      this.logger.error('Error during socket revalidation', err);
    } finally {
      this.isRevalidating = false;
    }
  }

  // 🚀 Broadcast methods (Public events)
  broadcastNewMessage(organizationId: string, messageData: any) {
    const safeDto = toPublicMessageDto(messageData);
    this.server.to(organizationId).emit('onNewMessage', safeDto);
  }

  broadcastLeadUpdate(organizationId: string, leadData: any) {
    const safeDto = toPublicLeadDto(leadData);
    this.server.to(organizationId).emit('onLeadUpdate', safeDto);
  }

  broadcastConversationUpdate(organizationId: string, conversationData: any) {
    const safeDto = toPublicConversationDto(conversationData);
    this.server.to(organizationId).emit('onConversationUpdate', safeDto);
  }

  broadcastNotification(userId: string, notificationData: any) {
    const safeDto = toPublicNotificationDto(notificationData);
    this.server.to(`user_${userId}`).emit('new_notification', safeDto);
  }
}
