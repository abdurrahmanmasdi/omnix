import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../../auth/permission.service';
import { EventsGateway } from '../../events/events/events.gateway';
import { tenantStorage } from '../tenant/tenant.context';

@Processor('outbox-relay')
export class NotificationRelayProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationRelayProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly gateway: EventsGateway,
  ) {
    super();
  }

  async process(job: Job<{ organizationId?: unknown; notificationId?: unknown }>) {
    if (job.name !== 'notification.broadcast') return;
    const { organizationId, notificationId } = job.data ?? {};
    if (typeof organizationId !== 'string' || typeof notificationId !== 'string')
      throw new Error('NOTIFICATION_OUTBOX_INVALID');

    return tenantStorage.run({ organizationId }, async () => {
      const notification = await this.prisma.notification.findFirst({
        where: { id: notificationId, organizationId },
      });
      if (!notification) return;
      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          organizationId,
          userId: notification.userId,
          status: 'ACTIVE',
          deletedAt: null,
          user: { status: 'ACTIVE', deletedAt: null },
        },
        select: { id: true },
      });
      if (!membership || !(await this.permissions.has(notification.userId, organizationId, 'notifications:view')))
        return;

      if (notification.referenceType === 'LEAD' && notification.referenceId) {
        const lead = await this.prisma.lead.findFirst({
          where: { id: notification.referenceId, organizationId, deletedAt: null },
          select: { assignedAgentId: true },
        });
        if (!lead || (lead.assignedAgentId !== notification.userId &&
          !(await this.permissions.has(notification.userId, organizationId, 'leads:read:all'))))
          return;
      }
      if (notification.referenceType === 'CONVERSATION' && notification.referenceId) {
        const conversation = await this.prisma.conversation.findFirst({
          where: { id: notification.referenceId, organizationId, deletedAt: null },
          select: { assignedAgentId: true, lead: { select: { assignedAgentId: true } } },
        });
        if (!conversation || (
          conversation.assignedAgentId !== notification.userId &&
          conversation.lead?.assignedAgentId !== notification.userId &&
          !(await this.permissions.has(notification.userId, organizationId, 'leads:read:all'))
        )) return;
      }
      try {
        await this.gateway.broadcastNotification(notification.userId, notification);
      } catch {
        this.logger.warn(`NOTIFICATION_RELAY_RETRY notificationId=${notification.id}`);
        throw new Error('NOTIFICATION_RELAY_RETRY');
      }
    });
  }
}
