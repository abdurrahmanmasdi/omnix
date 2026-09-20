import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantStorage } from '../tenant/tenant.context';

@Injectable()
export class OutboxReplayService {
  private readonly logger = new Logger(OutboxReplayService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resets FAILED outbox events to PENDING so they are picked up by the OutboxProcessor.
   */
  async replayFailedEvents(organizationId?: string): Promise<number> {
    return tenantStorage.run({ isSystemBypass: true }, async () => {
      const whereClause = {
        status: 'FAILED',
        ...(organizationId ? { organizationId } : {}),
      };

      const result = await this.prisma.outboxEvent.updateMany({
        where: whereClause,
        data: {
          status: 'PENDING',
          error: null,
        },
      });

      this.logger.log(`Replayed ${result.count} failed outbox events.`);
      return result.count;
    });
  }
}
