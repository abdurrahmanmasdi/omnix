import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events/events.gateway';
import { NotificationType } from '@prisma/client';
import { PermissionService } from '../auth/permission.service';

export interface SendNotificationDto {
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  referenceId?: string;
  referenceType?: string;
}

@Injectable()
export class NotificationEmitterService {
  private readonly logger = new Logger(NotificationEmitterService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway, // Your existing WebSocket gateway
    private readonly permissions: PermissionService,
  ) {}

  /**
   * Internal method called by your background workers or AI Webhooks
   */
  async send(data: SendNotificationDto) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId: data.organizationId,
        userId: data.userId,
        status: 'ACTIVE',
        deletedAt: null,
        user: { status: 'ACTIVE', deletedAt: null },
      },
      select: { id: true },
    });
    if (
      !membership ||
      !(await this.permissions.has(
        data.userId,
        data.organizationId,
        'notifications:view',
      ))
    )
      return null;

    if (data.referenceType === 'LEAD' && data.referenceId) {
      const lead = await this.prisma.lead.findFirst({
        where: {
          id: data.referenceId,
          organizationId: data.organizationId,
          deletedAt: null,
        },
        select: { assignedAgentId: true },
      });
      if (
        !lead ||
        (lead.assignedAgentId !== data.userId &&
          !(await this.permissions.has(
            data.userId,
            data.organizationId,
            'leads:read:all',
          )))
      )
        return null;
    }
    if (data.referenceType === 'CONVERSATION' && data.referenceId) {
      const conversation = await this.prisma.conversation.findFirst({
        where: {
          id: data.referenceId,
          organizationId: data.organizationId,
          deletedAt: null,
        },
        select: {
          assignedAgentId: true,
          lead: { select: { assignedAgentId: true } },
        },
      });
      if (
        !conversation ||
        (conversation.assignedAgentId !== data.userId &&
          conversation.lead?.assignedAgentId !== data.userId &&
          !(await this.permissions.has(
            data.userId,
            data.organizationId,
            'leads:read:all',
          )))
      )
        return null;
    }
    const mayReadPii = await this.permissions.has(
      data.userId,
      data.organizationId,
      'leads:read:pii',
    );
    const mayReadMessages = await this.permissions.has(
      data.userId,
      data.organizationId,
      'leads:read:messages',
    );
    const title = mayReadPii ? data.title : 'New notification';
    const body =
      mayReadPii && (data.type !== 'NEW_MESSAGE' || mayReadMessages)
        ? data.body
        : 'Open the inbox to view details.';
    // 1. Save to Database (Persistence)
    const notification = await this.prisma.notification.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        type: data.type,
        title,
        body,
        referenceId: data.referenceId,
        referenceType: data.referenceType,
      },
    });

    // 2. Emit via WebSocket in Real-Time
    // The eventsGateway will map it to a strict DTO and emit to the user's room
    await this.eventsGateway
      .broadcastNotification(data.userId, notification)
      .catch((error: unknown) =>
        this.logger.warn('Notification live broadcast failed', error),
      );

    return notification;
  }
}
