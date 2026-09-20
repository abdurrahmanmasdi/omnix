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
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processPendingEvents() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await tenantStorage.run({ isSystemBypass: true }, async () => {
        const events = await this.prisma.outboxEvent.findMany({
          where: { status: 'PENDING' },
          take: 50,
          orderBy: { createdAt: 'asc' },
        });

        if (events.length === 0) {
          this.isProcessing = false;
          return;
        }

        this.logger.debug(`Found ${events.length} pending outbox events.`);

        for (const event of events) {
          try {
            // Push to BullMQ or external service depending on topic
            await this.outboxRelayQueue.add(event.topic, event.payload, {
              jobId: `outbox-${event.id}`,
              removeOnComplete: true,
              removeOnFail: false,
            });

            await this.prisma.outboxEvent.update({
              where: { id: event.id },
              data: {
                status: 'PROCESSED',
                processedAt: new Date(),
              },
            });
          } catch (error: any) {
            this.logger.error(`Failed to process outbox event ${event.id}: ${error.message}`);
            await this.prisma.outboxEvent.update({
              where: { id: event.id },
              data: {
                status: 'FAILED',
                error: error.message,
              },
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
