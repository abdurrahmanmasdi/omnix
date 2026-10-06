import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType, Prisma } from '@prisma/client';
import { PermissionService } from '../auth/permission.service';
import {
  GENERIC_NOTIFICATION_BODY,
  GENERIC_NOTIFICATION_TITLE,
} from './notifications.service';

export interface SendNotificationDto {
  organizationId: string;
  userId: string;
  type: NotificationType;
  code?: string;
  params?: Prisma.InputJsonObject;
  title: string;
  body: string;
  referenceId?: string;
  referenceType?: string;
}

@Injectable()
export class NotificationEmitterService {
  constructor(
    private readonly prisma: PrismaService,
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
    const title = mayReadPii ? data.title : GENERIC_NOTIFICATION_TITLE;
    const body =
      mayReadPii && (data.type !== 'NEW_MESSAGE' || mayReadMessages)
        ? data.body
        : GENERIC_NOTIFICATION_BODY;
    // 1. Save to Database (Persistence)
    return this.prisma.$transaction(async (tx) => {
      const notification = await tx.notification.create({
        data: {
          organizationId: data.organizationId,
          userId: data.userId,
          type: data.type,
          title,
          body,
          code:
            !mayReadPii || (data.type === 'NEW_MESSAGE' && !mayReadMessages)
              ? 'GENERIC_NOTIFICATION'
              : (data.code ?? data.type),
          params:
            !mayReadPii || (data.type === 'NEW_MESSAGE' && !mayReadMessages)
              ? {}
              : (data.params ?? {}),
          referenceId: data.referenceId,
          referenceType: data.referenceType,
        },
      });
      await tx.outboxEvent.create({
        data: {
          organizationId: data.organizationId,
          topic: 'notification.broadcast',
          payload: {
            organizationId: data.organizationId,
            notificationId: notification.id,
          },
        },
      });
      return notification;
    });
  }
}
