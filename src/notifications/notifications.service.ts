import { Injectable } from '@nestjs/common';
import { Notification, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface NotificationDelegate {
  findMany(args: {
    where: { organizationId: string; userId: string };
    orderBy: { createdAt: 'desc' };
    take: number;
  }): Promise<Notification[]>;
  count(args: {
    where: { organizationId: string; userId: string; isRead: boolean };
  }): Promise<number>;
  updateMany(args: {
    where:
      | { organizationId: string; userId: string; id: string }
      | { organizationId: string; userId: string; isRead: false };
    data: { isRead: true };
  }): Promise<Prisma.BatchPayload>;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Used by the Frontend to get the dropdown list
  async getUserNotifications(
    organizationId: string,
    userId: string,
    limit = 20,
  ): Promise<Notification[]> {
    const prisma = this.prisma as PrismaService & {
      notification: NotificationDelegate;
    };

    return await prisma.notification.findMany({
      where: { organizationId, userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // Used by the Frontend to get the red bubble count
  async getUnreadCount(
    organizationId: string,
    userId: string,
  ): Promise<number> {
    const prisma = this.prisma as PrismaService & {
      notification: NotificationDelegate;
    };

    return await prisma.notification.count({
      where: { organizationId, userId, isRead: false },
    });
  }

  // When the user clicks the bell icon or a specific notification
  async markAsRead(
    organizationId: string,
    userId: string,
    notificationId?: string,
  ): Promise<Prisma.BatchPayload> {
    const prisma = this.prisma as PrismaService & {
      notification: NotificationDelegate;
    };

    return await prisma.notification.updateMany({
      where: {
        organizationId,
        userId,
        ...(notificationId ? { id: notificationId } : { isRead: false }),
      },
      data: { isRead: true },
    });
  }
}
