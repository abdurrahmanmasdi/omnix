import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { tenantStorage } from '../tenant/tenant.context';

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('outbox-relay') private readonly outboxRelayQueue: Queue,
    @InjectQueue('ai-reply') private readonly aiReplyQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processPendingEvents() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await tenantStorage.run({ isSystemBypass: true }, async () => {
        const events = await this.prisma.$queryRaw<any[]>`
          UPDATE "outbox_events"
          SET status = 'PROCESSING'
          WHERE id IN (
            SELECT id FROM "outbox_events"
            WHERE status = 'PENDING'
            ORDER BY "createdAt" ASC
            LIMIT 50
            FOR UPDATE SKIP LOCKED
          )
          RETURNING *;
        `;

        if (!events || events.length === 0) {
          this.isProcessing = false;
          return;
        }

        this.logger.debug(`Found ${events.length} pending outbox events.`);

        // Group AI reply events by conversationId to batch newMessageIds
        const aiReplyEvents = events.filter(
          (e) => e.topic === 'generate-reply',
        );
        const otherEvents = events.filter((e) => e.topic !== 'generate-reply');

        const groups = new Map<string, typeof aiReplyEvents>();
        for (const event of aiReplyEvents) {
          const convId = event.payload.conversationId;
          if (!groups.has(convId)) groups.set(convId, []);
          groups.get(convId)!.push(event);
        }

        for (const [convId, group] of groups.entries()) {
          try {
            const newMessageIds = group
              .map((e) => e.payload.messageId)
              .filter(Boolean);
            const latestStateVersion = Math.max(
              ...group.map((e) => e.payload.stateVersion || 0),
            );
            const firstPayload = group[0].payload;

            await this.aiReplyQueue.add(
              'generate-reply',
              {
                organizationId: firstPayload.organizationId,
                conversationId: convId,
                customerPhone: firstPayload.customerPhone,
                newMessageIds,
                stateVersion: latestStateVersion,
              },
              {
                jobId: `reply-${group[0].id}`, // Use outbox event ID to ensure no dropped jobs
                delay: 7000,
                removeOnComplete: true,
              },
            );

            await this.prisma.outboxEvent.updateMany({
              where: { id: { in: group.map((e) => e.id) } },
              data: { status: 'PROCESSED', processedAt: new Date() },
            });
          } catch (err: any) {
            this.logger.error(
              `Failed to process batched ai-reply for ${convId}: ${err.message}`,
            );
            await this.prisma.outboxEvent.updateMany({
              where: { id: { in: group.map((e) => e.id) } },
              data: { status: 'FAILED', error: err.message },
            });
          }
        }

        for (const event of otherEvents) {
          try {
            await this.outboxRelayQueue.add(event.topic, event.payload, {
              jobId: `outbox-${event.id}`,
              removeOnComplete: true,
              removeOnFail: false,
            });
            await this.prisma.outboxEvent.update({
              where: { id: event.id },
              data: { status: 'PROCESSED', processedAt: new Date() },
            });
          } catch (error: any) {
            this.logger.error(
              `Failed to process outbox event ${event.id}: ${error.message}`,
            );
            await this.prisma.outboxEvent.update({
              where: { id: event.id },
              data: { status: 'FAILED', error: error.message },
            });
          }
        }
      });
    } catch (err) {
      this.logger.error('Error during outbox polling', err);
    } finally {
      this.isProcessing = false;
    }
  }
}
