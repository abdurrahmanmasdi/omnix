import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { tenantStorage } from '../tenant/tenant.context';

type ClaimedOutboxEvent = {
  id: string;
  topic: string;
  payload: {
    organizationId?: unknown;
    conversationId?: unknown;
    messageId?: unknown;
    stateVersion?: unknown;
  } | null;
};

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('outbox-relay') private readonly outboxRelayQueue: Queue,
    @InjectQueue('ai-reply') private readonly aiReplyQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async recoverStuckEvents() {
    // Recover events that were marked PROCESSING but never finished (e.g. due to crash)
    await tenantStorage.run({ isSystemBypass: true }, async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const result = await this.prisma.outboxEvent.updateMany({
        where: {
          status: 'PROCESSING',
          updatedAt: { lt: fiveMinutesAgo },
        },
        data: { status: 'PENDING' },
      });
      if (result.count > 0) {
        this.logger.warn(
          `Recovered ${result.count} stuck outbox events from PROCESSING to PENDING.`,
        );
      }
    });
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processPendingEvents() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await tenantStorage.run({ isSystemBypass: true }, async () => {
        const events = await this.prisma.$queryRaw<ClaimedOutboxEvent[]>`
          UPDATE "outbox_events"
          SET status = 'PROCESSING', "updatedAt" = CURRENT_TIMESTAMP
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
          const payload = event.payload ?? {};
          const key = `${String(payload.organizationId)}:${String(payload.conversationId)}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(event);
        }

        for (const [groupKey, group] of groups.entries()) {
          try {
            const newMessageIds = group
              .map((e) => e.payload?.messageId)
              .filter(
                (id): id is string => typeof id === 'string' && id.length > 0,
              );
            const firstPayload = group[0].payload ?? {};
            if (
              typeof firstPayload.organizationId !== 'string' ||
              typeof firstPayload.conversationId !== 'string' ||
              newMessageIds.length !== group.length ||
              group.some(
                (e) =>
                  e.payload?.organizationId !== firstPayload.organizationId ||
                  e.payload?.conversationId !== firstPayload.conversationId,
              )
            ) {
              throw new Error('OUTBOX_INVALID_INBOUND_PAYLOAD');
            }
            const latestStateVersion = group.reduce(
              (latest, event) =>
                Math.max(
                  latest,
                  typeof event.payload?.stateVersion === 'number'
                    ? event.payload.stateVersion
                    : 0,
                ),
              0,
            );
            if (latestStateVersion < 1)
              throw new Error('OUTBOX_INVALID_INBOUND_PAYLOAD');

            await this.aiReplyQueue.add(
              'generate-reply',
              {
                organizationId: firstPayload.organizationId,
                conversationId: firstPayload.conversationId,
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
              where: {
                id: { in: group.map((e) => e.id) },
                status: 'PROCESSING',
              },
              data: { status: 'PROCESSED', processedAt: new Date() },
            });
          } catch (err: any) {
            this.logger.error(`OUTBOX_INBOUND_RELAY_FAILED group=${groupKey}`);
            const invalid = err?.message === 'OUTBOX_INVALID_INBOUND_PAYLOAD';
            await this.prisma.outboxEvent.updateMany({
              where: {
                id: { in: group.map((e) => e.id) },
                status: 'PROCESSING',
              },
              data: {
                status: invalid ? 'FAILED' : 'PENDING',
                error: invalid
                  ? 'OUTBOX_INVALID_INBOUND_PAYLOAD'
                  : 'OUTBOX_INBOUND_RELAY_FAILED',
              },
            });
          }
        }

        for (const event of otherEvents) {
          try {
            await this.outboxRelayQueue.add(event.topic, event.payload, {
              jobId: `outbox-${event.id}`,
              attempts: event.topic === 'notification.broadcast' ? 5 : 1,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: { age: 86400, count: 10000 },
              removeOnFail: false,
            });
            await this.prisma.outboxEvent.update({
              where: { id: event.id },
              data: { status: 'PROCESSED', processedAt: new Date() },
            });
          } catch {
            this.logger.error(`OUTBOX_RELAY_FAILED eventId=${event.id}`);
            await this.prisma.outboxEvent.update({
              where: { id: event.id },
              data: {
                status: event.topic === 'notification.broadcast' ? 'PENDING' : 'FAILED',
                error: 'OUTBOX_RELAY_FAILED',
              },
            });
          }
        }
      });
    } catch {
      this.logger.error('OUTBOX_POLL_FAILED');
    } finally {
      this.isProcessing = false;
    }
  }
}
