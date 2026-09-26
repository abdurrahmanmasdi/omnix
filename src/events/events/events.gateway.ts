import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
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

        // Check if user is still active globally (fixes R06)
        const user = await this.prisma.user.findFirst({
          where: { id: userId, status: 'ACTIVE', deletedAt: null },
          select: { id: true },
        });

        if (!user) {
          throw new Error('User account is inactive or deleted');
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

          const canReadAll = await this.permissionService.has(
            userId,
            organizationId,
            'leads:read:all',
          );
          const canReadPii = await this.permissionService.has(
            userId,
            organizationId,
            'leads:read:pii',
          );
          const canReadMessages = await this.permissionService.has(
            userId,
            organizationId,
            'leads:read:messages',
          );

          // Store verified data on the client object
          socket.data = {
            userId,
            organizationId,
            roleId,
            membershipId: membership.id,
            tokenExp: exp,
            canReadAll,
            canReadPii,
            canReadMessages,
          };
        });

        next();
      } catch (error: any) {
        this.logger.error(`Socket handshake rejected: ${error.message}`);
        next(new Error('UnauthorizedException'));
      }
    });
  }

  private activeOrganizations = new Set<string>();

  async handleConnection(client: Socket) {
    const { userId, organizationId } = client.data;
    if (userId && organizationId) {
      await client.join(organizationId as string);
      await client.join(`user_${userId as string}`);
      this.activeOrganizations.add(organizationId as string);
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
    for (const orgId of this.activeOrganizations) {
      this.server.in(orgId).disconnectSockets(true);
    }
  }

  private async revalidateConnections() {
    if (this.isRevalidating) return;
    this.isRevalidating = true;

    try {
      const now = Math.floor(Date.now() / 1000);

      for (const organizationId of this.activeOrganizations) {
        const sockets = await this.server.in(organizationId).fetchSockets();

        if (sockets.length === 0) {
          this.activeOrganizations.delete(organizationId);
          continue;
        }

        // Revalidate all sockets in this org inside a single tenant context
        await tenantStorage.run({ organizationId }, async () => {
          for (const socket of sockets) {
            const { userId, roleId, tokenExp } = socket.data;
            if (!userId) continue;

            if (tokenExp && tokenExp < now) {
              this.logger.warn(
                `Disconnecting ${socket.id} due to token expiry`,
              );
              socket.disconnect(true);
              continue;
            }

            try {
              const user = await this.prisma.user.findUnique({
                where: { id: userId },
                include: {
                  memberships: {
                    where: {
                      organizationId,
                      roleId,
                      status: 'ACTIVE',
                      deletedAt: null,
                    },
                  },
                },
              });

              if (
                !user ||
                user.status === 'PENDING' ||
                user.status === 'SUSPENDED'
              ) {
                throw new Error('User account is not active');
              }

              if (user.memberships.length === 0) {
                throw new Error('Membership inactive or role changed');
              }

              const hasPermission = await this.permissionService.has(
                userId as string,
                organizationId,
                'view_conversations',
              );
              if (!hasPermission) throw new Error('Permission revoked');

              socket.data.canReadAll = await this.permissionService.has(
                userId as string,
                organizationId,
                'leads:read:all',
              );
              socket.data.canReadPii = await this.permissionService.has(
                userId as string,
                organizationId,
                'leads:read:pii',
              );
              socket.data.canReadMessages = await this.permissionService.has(
                userId as string,
                organizationId,
                'leads:read:messages',
              );
            } catch (error: any) {
              this.logger.warn(
                `Disconnecting ${socket.id} due to revalidation failure: ${error.message}`,
              );
              socket.disconnect(true);
            }
          }
        });
      }
    } catch (err) {
      this.logger.error('Error during socket revalidation', err);
    } finally {
      this.isRevalidating = false;
    }
  }

  private async getAssignedAgentForConversation(
    conversationId: string,
  ): Promise<string | null> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { lead: { select: { assignedAgentId: true } } },
    });
    return conv?.lead?.assignedAgentId || null;
  }

  private maskLeadPii(lead: any) {
    const masked = { ...lead };
    if (masked.phoneNumber) {
      masked.phoneNumber = masked.phoneNumber.replace(/\d(?=\d{4})/g, '*');
    }
    if (masked.email) {
      const [local, domain] = masked.email.split('@');
      if (domain) masked.email = `${local.substring(0, 2)}***@${domain}`;
    }
    return masked;
  }

  private maskMessageContent(message: any) {
    return {
      ...message,
      content: '[Message content hidden]',
      mediaUrl: message.mediaUrl ? '[Media hidden]' : null,
    };
  }

  private async emitToAuthorized(
    organizationId: string,
    event: string,
    payload: any,
    assignedAgentId: string | null,
  ) {
    const sockets = await this.server.in(organizationId).fetchSockets();
    for (const socket of sockets) {
      const { canReadAll, canReadPii, canReadMessages, userId } = socket.data;

      const isAssigned = assignedAgentId && userId === assignedAgentId;
      if (!canReadAll && !isAssigned) {
        continue;
      }

      let personalizedPayload = payload;

      if (event === 'onLeadUpdate') {
        if (!canReadPii) personalizedPayload = this.maskLeadPii(payload);
      } else if (event === 'onNewMessage') {
        if (!canReadMessages)
          personalizedPayload = this.maskMessageContent(payload);
      } else if (event === 'onConversationUpdate' && payload.lead) {
        if (!canReadPii) {
          personalizedPayload = {
            ...payload,
            lead: this.maskLeadPii(payload.lead),
          };
        }
      }

      socket.emit(event, personalizedPayload);
    }
  }

  // 🚀 Broadcast methods (Public events)
  async broadcastNewMessage(organizationId: string, messageData: any) {
    const safeDto = toPublicMessageDto(messageData);
    const assignedAgentId = await this.getAssignedAgentForConversation(
      messageData.conversationId as string,
    );
    await this.emitToAuthorized(
      organizationId,
      'onNewMessage',
      safeDto,
      assignedAgentId,
    );
  }

  async broadcastLeadUpdate(organizationId: string, leadData: any) {
    const safeDto = toPublicLeadDto(leadData);
    const assignedAgentId = leadData.assignedAgentId || null;
    await this.emitToAuthorized(
      organizationId,
      'onLeadUpdate',
      safeDto,
      assignedAgentId as string,
    );
  }

  async broadcastConversationUpdate(
    organizationId: string,
    conversationData: any,
  ) {
    const safeDto = toPublicConversationDto(conversationData);
    const assignedAgentId =
      conversationData.lead?.assignedAgentId ||
      (await this.getAssignedAgentForConversation(
        conversationData.id as string,
      ));
    await this.emitToAuthorized(
      organizationId,
      'onConversationUpdate',
      safeDto,
      assignedAgentId as string,
    );
  }

  broadcastNotification(userId: string, notificationData: any) {
    const safeDto = toPublicNotificationDto(notificationData);
    this.server.to(`user_${userId}`).emit('new_notification', safeDto);
  }
}
