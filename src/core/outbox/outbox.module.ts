import { Module } from '@nestjs/common';
import { OutboxProcessor } from './outbox.processor';
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
  providers: [OutboxProcessor],
})
export class OutboxModule {}
