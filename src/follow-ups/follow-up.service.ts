import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { FollowUpType, FollowUpStatus } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { tenantStorage } from '../core/tenant/tenant.context';

@Injectable()
export class FollowUpService {
  private readonly logger = new Logger(FollowUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('follow-up') private readonly followUpQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async recoverDueFollowUps() {
    await tenantStorage.run({ isSystemBypass: true }, async () => {
      const now = new Date();
      const due = await this.prisma.scheduledFollowUp.findMany({
        where: {
          status: FollowUpStatus.PENDING,
          scheduledAt: { lt: new Date(now.getTime() - 120_000) },
          OR: [
            { recoveryQueuedAt: null },
            { recoveryQueuedAt: { lt: new Date(now.getTime() - 300_000) } },
          ],
          AND: [
            {
              OR: [
                { processingOwner: null },
                { processingLeaseUntil: { lt: now } },
              ],
            },
          ],
        },
        take: 100,
        orderBy: { scheduledAt: 'asc' },
      });
      for (const followUp of due) {
        const queuedAt = new Date();
        const marked = await this.prisma.scheduledFollowUp.updateMany({
          where: {
            id: followUp.id,
            status: FollowUpStatus.PENDING,
            OR: [
              { recoveryQueuedAt: null },
              { recoveryQueuedAt: { lt: new Date(Date.now() - 300_000) } },
            ],
            AND: [
              {
                OR: [
                  { processingOwner: null },
                  { processingLeaseUntil: { lt: new Date() } },
                ],
              },
            ],
          },
          data: { recoveryQueuedAt: queuedAt },
        });
        if (marked.count !== 1) continue;
        try {
          await this.followUpQueue.add(
            'process-follow-up',
            { followUpId: followUp.id },
            {
              jobId: `followup-recovery-${followUp.id}-${Math.floor(queuedAt.getTime() / 300_000)}`,
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
              removeOnComplete: true,
              removeOnFail: false,
            },
          );
        } catch {
          await this.prisma.scheduledFollowUp.updateMany({
            where: { id: followUp.id, recoveryQueuedAt: queuedAt },
            data: { recoveryQueuedAt: null },
          });
          this.logger.error(`FOLLOW_UP_RELAY_FAILED followUp=${followUp.id}`);
        }
      }
    });
  }

  /**
   * Schedules standard 12h and 24h follow ups after the AI replies.
   */
  async scheduleAutoFollowUps(conversationId: string, organizationId: string) {
    // 1. Cancel any existing pending follow-ups
    await this.cancelPendingFollowUps(
      conversationId,
      'Re-scheduled due to new AI reply',
    );

    const now = new Date();

    // 12 hours from now
    const time12h = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    // 24 hours from now
    const time24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Create records in DB
    const followUp12h = await this.prisma.scheduledFollowUp.create({
      data: {
        conversationId,
        organizationId,
        type: FollowUpType.AUTO_NO_REPLY,
        attempt: 1,
        scheduledAt: time12h,
      },
    });

    const followUp24h = await this.prisma.scheduledFollowUp.create({
      data: {
        conversationId,
        organizationId,
        type: FollowUpType.AUTO_NO_REPLY,
        attempt: 2,
        scheduledAt: time24h,
      },
    });

    // Add to BullMQ
    const job12h = await this.followUpQueue.add(
      'process-follow-up',
      { followUpId: followUp12h.id },
      { delay: 12 * 60 * 60 * 1000, removeOnComplete: true },
    );

    const job24h = await this.followUpQueue.add(
      'process-follow-up',
      { followUpId: followUp24h.id },
      { delay: 24 * 60 * 60 * 1000, removeOnComplete: true },
    );

    // Update records with Job IDs
    await this.prisma.scheduledFollowUp.update({
      where: { id: followUp12h.id },
      data: { bullJobId: job12h.id },
    });

    await this.prisma.scheduledFollowUp.update({
      where: { id: followUp24h.id },
      data: { bullJobId: job24h.id },
    });

    await this.updateLeadNextFollowUp(conversationId);

    this.logger.log(
      `Scheduled auto follow-ups for Conv ${conversationId} (12h, 24h)`,
    );
  }

  /**
   * Schedules a custom follow up specified by the AI tool
   */
  async scheduleAiFollowUp(
    organizationId: string,
    conversationId: string,
    scheduledAt: Date,
    context?: string,
  ) {
    // 1. Cancel existing
    await this.cancelPendingFollowUps(
      conversationId,
      'Overridden by AI scheduled follow-up',
    );

    const now = new Date();
    const delay = Math.max(0, scheduledAt.getTime() - now.getTime());

    const followUp = await this.prisma.scheduledFollowUp.create({
      data: {
        conversationId,
        organizationId,
        type: FollowUpType.AI_SCHEDULED,
        attempt: 1,
        scheduledAt,
        aiContext: context,
      },
    });

    const job = await this.followUpQueue.add(
      'process-follow-up',
      { followUpId: followUp.id },
      { delay, removeOnComplete: true },
    );

    await this.prisma.scheduledFollowUp.update({
      where: { id: followUp.id },
      data: { bullJobId: job.id },
    });

    await this.updateLeadNextFollowUp(conversationId);

    this.logger.log(
      `Scheduled AI follow-up for Conv ${conversationId} at ${scheduledAt.toISOString()}`,
    );
  }

  /**
   * Cancels all pending follow ups for a conversation.
   * Called when the customer sends a new message.
   */
  async cancelPendingFollowUps(
    conversationId: string,
    reason = 'Customer responded',
  ) {
    const pending = await this.prisma.scheduledFollowUp.findMany({
      where: {
        conversationId,
        status: FollowUpStatus.PENDING,
      },
    });

    if (pending.length === 0) return;

    for (const record of pending) {
      if (record.bullJobId) {
        // Try to remove from queue
        try {
          const job = await this.followUpQueue.getJob(record.bullJobId);
          if (job) {
            await job.remove();
          }
        } catch {
          this.logger.warn(`FOLLOW_UP_QUEUE_REMOVE_FAILED followUp=${record.id}`);
        }
      }
    }

    await this.prisma.scheduledFollowUp.updateMany({
      where: {
        conversationId,
        status: FollowUpStatus.PENDING,
      },
      data: {
        status: FollowUpStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });

    await this.updateLeadNextFollowUp(conversationId);
    this.logger.log(
      `Cancelled ${pending.length} pending follow-ups for Conv ${conversationId}`,
    );
  }

  /**
   * Updates the Lead's nextFollowUpAt field based on pending followups
   */
  private async updateLeadNextFollowUp(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { leadId: true },
    });

    if (!conversation?.leadId) return;

    const nextPending = await this.prisma.scheduledFollowUp.findFirst({
      where: {
        conversationId,
        status: FollowUpStatus.PENDING,
      },
      orderBy: { scheduledAt: 'asc' },
    });

    await this.prisma.lead.update({
      where: { id: conversation.leadId },
      data: { nextFollowUpAt: nextPending ? nextPending.scheduledAt : null },
    });
  }
}
