import { Injectable } from '@nestjs/common';
import { Notification, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../auth/permission.service';
import { tenantStorage } from '../core/tenant/tenant.context';

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

export const GENERIC_NOTIFICATION_TITLE = 'New notification';
export const GENERIC_NOTIFICATION_BODY = 'Open the inbox to view details.';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  // Used by the Frontend to get the dropdown list
  async getUserNotifications(
    organizationId: string,
    userId: string,
    limit = 20,
  ): Promise<Notification[]> {
    const rows = await this.findVisibleNotifications(
      organizationId,
      userId,
      limit,
    );
    return this.generalizeForCurrentGrants(organizationId, userId, rows);
  }

  /**
   * Stored title/body were generalized at write time against the grants the
   * recipient held then. Grants can be revoked afterwards, so the text is
   * generalized again at read time against the grants held now (KI-011).
   */
  private async generalizeForCurrentGrants(
    organizationId: string,
    userId: string,
    rows: Notification[],
  ): Promise<Notification[]> {
    if (rows.length === 0) return rows;
    const [mayReadPii, mayReadMessages] = await Promise.all([
      this.permissionService.has(userId, organizationId, 'leads:read:pii'),
      this.permissionService.has(userId, organizationId, 'leads:read:messages'),
    ]);
    return rows.map((row) => {
      const hideBody =
        !mayReadPii || (row.type === 'NEW_MESSAGE' && !mayReadMessages);
      return {
        ...row,
        code: hideBody ? 'GENERIC_NOTIFICATION' : row.code,
        params: hideBody ? {} : row.params,
        title: mayReadPii ? row.title : GENERIC_NOTIFICATION_TITLE,
        body: hideBody ? GENERIC_NOTIFICATION_BODY : row.body,
      };
    });
  }

  private async findVisibleNotifications(
    organizationId: string,
    userId: string,
    limit: number,
  ): Promise<Notification[]> {
    const canReadAll = await this.permissionService.has(
      userId,
      organizationId,
      'leads:read:all',
    );

    if (canReadAll) {
      const prisma = this.prisma as PrismaService & {
        notification: NotificationDelegate;
      };
      return await prisma.notification.findMany({
        where: { organizationId, userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    }

    return await tenantStorage.run(
      { isSystemBypass: true, organizationId },
      async () => {
        return await this.prisma.$queryRaw<Notification[]>`
        SELECT n.*
        FROM notifications n
        WHERE n."organizationId" = ${organizationId}::uuid
          AND n."userId" = ${userId}::uuid
          AND (
            n."referenceType" IS NULL
            OR n."referenceType" NOT IN ('LEAD', 'CONVERSATION')
            OR (
              n."referenceType" = 'LEAD'
              AND EXISTS (
                SELECT 1 FROM leads l
                WHERE l.id = n."referenceId"::uuid
                  AND l."organizationId" = ${organizationId}::uuid
                  AND l."assignedAgentId" = ${userId}::uuid
                  AND l."deletedAt" IS NULL
              )
            )
            OR (
              n."referenceType" = 'CONVERSATION'
              AND EXISTS (
                SELECT 1 FROM conversations c
                LEFT JOIN leads l ON c."leadId" = l.id
                WHERE c.id = n."referenceId"::uuid
                  AND c."organizationId" = ${organizationId}::uuid
                  AND c."deletedAt" IS NULL
                  AND (c."assignedAgentId" = ${userId}::uuid OR l."assignedAgentId" = ${userId}::uuid)
              )
            )
          )
        ORDER BY n."createdAt" DESC
        LIMIT ${limit}
      `;
      },
    );
  }

  // Used by the Frontend to get the red bubble count
  async getUnreadCount(
    organizationId: string,
    userId: string,
  ): Promise<number> {
    const canReadAll = await this.permissionService.has(
      userId,
      organizationId,
      'leads:read:all',
    );

    if (canReadAll) {
      const prisma = this.prisma as PrismaService & {
        notification: NotificationDelegate;
      };
      return await prisma.notification.count({
        where: { organizationId, userId, isRead: false },
      });
    }

    return await tenantStorage.run(
      { isSystemBypass: true, organizationId },
      async () => {
        const result = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count
        FROM notifications n
        WHERE n."organizationId" = ${organizationId}::uuid
          AND n."userId" = ${userId}::uuid
          AND n."isRead" = false
          AND (
            n."referenceType" IS NULL
            OR n."referenceType" NOT IN ('LEAD', 'CONVERSATION')
            OR (
              n."referenceType" = 'LEAD'
              AND EXISTS (
                SELECT 1 FROM leads l
                WHERE l.id = n."referenceId"::uuid
                  AND l."organizationId" = ${organizationId}::uuid
                  AND l."assignedAgentId" = ${userId}::uuid
                  AND l."deletedAt" IS NULL
              )
            )
            OR (
              n."referenceType" = 'CONVERSATION'
              AND EXISTS (
                SELECT 1 FROM conversations c
                LEFT JOIN leads l ON c."leadId" = l.id
                WHERE c.id = n."referenceId"::uuid
                  AND c."organizationId" = ${organizationId}::uuid
                  AND c."deletedAt" IS NULL
                  AND (c."assignedAgentId" = ${userId}::uuid OR l."assignedAgentId" = ${userId}::uuid)
              )
            )
          )
      `;
        return Number(result[0].count);
      },
    );
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
