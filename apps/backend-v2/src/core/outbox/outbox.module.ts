import { Module } from '@nestjs/common';
import { OutboxProcessor } from './outbox.processor';
import { PrismaModule } from '../../prisma/prisma.module';
import { BullModule } from '@nestjs/bullmq';
import { NotificationRelayProcessor } from './notification-relay.processor';
import { EventsModule } from '../../events/events.module';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    EventsModule,
    AuthModule,
    BullModule.registerQueue({
      name: 'outbox-relay',
    }),
    BullModule.registerQueue({
      name: 'ai-reply',
    }),
  ],
  providers: [OutboxProcessor, NotificationRelayProcessor],
})
export class OutboxModule {}
