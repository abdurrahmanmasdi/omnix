import { Module } from '@nestjs/common';
import { OutboxProcessor } from './outbox.processor';
import { OutboxReplayService } from './outbox-replay.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'outbox-relay',
    }),
    BullModule.registerQueue({
      name: 'ai-reply',
    }),
  ],
  providers: [OutboxProcessor, OutboxReplayService],
  exports: [OutboxReplayService],
})
export class OutboxModule {}
