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
  type MessageSource,
  type LeadSource,
  type ConversationSource,
} from '../dto/public-events.dto';
import type { NotificationInvalidationPayload } from '../dto/socket-events.generated';

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
          select: { id: true, securityVersion: true },
        });

        if (!user) {
          throw new Error('User account is inactive or deleted');
        }

        if (
          payload.securityVersion &&
          user.securityVersion !== payload.securityVersion
        ) {
          throw new Error('Session revoked due to security changes');
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
            securityVersion: payload.securityVersion || user.securityVersion,
            canReadAll,
            canReadPii,
            canReadMessages,
          };
        });

        next();
      } catch {
        this.logger.warn('SOCKET_HANDSHAKE_REJECTED');
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
            } catch {
              this.logger.warn(`SOCKET_ACCESS_REVOKED socketId=${socket.id}`);
              socket.disconnect(true);
            }
          }
        });
      }
    } catch {
      this.logger.error('SOCKET_REVALIDATION_FAILED');
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
    masked.summary = null;
    return masked;
  }

  private maskMessageContent(message: any) {
    return {
      ...message,
      content: '[Message content hidden]',
      mediaUrl: message.mediaUrl ? '[Media hidden]' : null,
    };
  }

  private async currentSocketAccess(
    organizationId: string,
    socket: { data: Record<string, any>; disconnect(force?: boolean): void },
    requiredPermission: string,
  ) {
    const { userId, roleId, tokenExp } = socket.data;
    if (
      socket.data.organizationId !== organizationId ||
      typeof userId !== 'string' ||
      typeof roleId !== 'string' ||
      typeof tokenExp !== 'number' ||
      tokenExp <= Math.floor(Date.now() / 1000)
    ) {
      socket.disconnect(true);
      return null;
    }
    const [user, membership] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, status: 'ACTIVE', deletedAt: null },
        select: { id: true, securityVersion: true },
      }),
      this.prisma.organizationMembership.findFirst({
        where: {
          userId,
          roleId,
          organizationId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: { id: true },
      }),
    ]);

    const payloadSecVer = Number(socket.data?.securityVersion);
    const validSecVer =
      isNaN(payloadSecVer) || user?.securityVersion === payloadSecVer;

    if (
      !user ||
      !validSecVer ||
      !membership ||
      !(await this.permissionService.has(
        userId,
        organizationId,
        requiredPermission,
      ))
    ) {
      socket.disconnect(true);
      return null;
    }
    return {
      userId,
      canReadAll: await this.permissionService.has(
        userId,
        organizationId,
        'leads:read:all',
      ),
      canReadPii: await this.permissionService.has(
        userId,
        organizationId,
        'leads:read:pii',
      ),
      canReadMessages: await this.permissionService.has(
        userId,
        organizationId,
        'leads:read:messages',
      ),
    };
  }

  private async emitToAuthorized(
    organizationId: string,
    event: string,
    payload: any,
    assignedAgentId: string | null,
  ) {
    const sockets = await this.server.in(organizationId).fetchSockets();
    await tenantStorage.run({ organizationId }, async () => {
      for (const socket of sockets) {
        const access = await this.currentSocketAccess(
          organizationId,
          socket,
          'view_conversations',
        );
        if (!access) continue;
        const { canReadAll, canReadPii, canReadMessages, userId } = access;

        const isAssigned = assignedAgentId && userId === assignedAgentId;
        if (!canReadAll && !isAssigned) {
          continue;
        }

        let personalizedPayload = payload;

        if (event === 'onLeadUpdate') {
          personalizedPayload = canReadPii
            ? { ...payload, summary: null }
            : this.maskLeadPii(payload);
        } else if (event === 'onNewMessage') {
          if (!canReadMessages)
            personalizedPayload = this.maskMessageContent(payload);
        } else if (event === 'onConversationUpdate') {
          if (!canReadPii) {
            personalizedPayload = {
              ...payload,
              externalContactId: null,
            };
          }
        }

        socket.emit(event, personalizedPayload);
      }
    });
  }

  // 🚀 Broadcast methods (Public events)
  async broadcastNewMessage(
    organizationId: string,
    messageData: MessageSource,
  ) {
    const safeDto = toPublicMessageDto(messageData);
    const assignedAgentId = await this.getAssignedAgentForConversation(
      messageData.conversationId,
    );
    await this.emitToAuthorized(
      organizationId,
      'onNewMessage',
      safeDto,
      assignedAgentId,
    );
  }

  async broadcastLeadUpdate(organizationId: string, leadData: LeadSource) {
    const safeDto = toPublicLeadDto(leadData);
    const assignedAgentId = leadData.assignedAgentId || null;
    await this.emitToAuthorized(
      organizationId,
      'onLeadUpdate',
      safeDto,
      assignedAgentId,
    );
  }

  async broadcastConversationUpdate(
    organizationId: string,
    conversationData: ConversationSource,
  ) {
    const safeDto = toPublicConversationDto(conversationData);
    const lead = conversationData.lead;
    const leadAgentId =
      lead &&
      typeof lead === 'object' &&
      'assignedAgentId' in lead &&
      typeof lead.assignedAgentId === 'string'
        ? lead.assignedAgentId
        : null;
    const assignedAgentId =
      leadAgentId ||
      (await this.getAssignedAgentForConversation(conversationData.id));
    await this.emitToAuthorized(
      organizationId,
      'onConversationUpdate',
      safeDto,
      assignedAgentId,
    );
  }

  async broadcastNotification(
    userId: string,
    notificationData: {
      id?: string;
      organizationId?: string;
      title?: string;
      body?: string;
    },
  ) {
    const organizationId = notificationData.organizationId;
    const notificationId = notificationData.id;
    if (!organizationId || !notificationId) return;
    const sockets = await this.server.in(`user_${userId}`).fetchSockets();
    await tenantStorage.run({ organizationId }, async () => {
      for (const socket of sockets) {
        const access = await this.currentSocketAccess(
          organizationId,
          socket,
          'notifications:view',
        );
        if (!access || access.userId !== userId) continue;
        const payload: NotificationInvalidationPayload = {
          id: notificationId,
          organizationId,
          type: 'UPDATE',
          title: 'New notification',
          body: 'Open notifications to view details.',
        };
        socket.emit('new_notification', payload);
      }
    });
  }
}
