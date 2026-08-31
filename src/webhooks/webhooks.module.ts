import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhooksProcessor } from './webhooks.processor';
import { WhatsappService } from './whatsapp.service';
import { EventsModule } from '../events/events.module';
import { AiReplyProcessor } from './ai-reply.processor';
import { NotificationEmitterService } from '../notifications/notification-emitter.service';
import { ActionExecutorService } from './action-executor.service';
import { CrmIntegrationModule } from '../modules/integration/crm/crm-integration.module';
import { WhatsappMediaService } from './whatsapp-media.service';

@Module({
  imports: [
    HttpModule,
    EventsModule,
    CrmIntegrationModule,
    // Register the specific queue we will push messages to
    BullModule.registerQueue({
      name: 'whatsapp-messages',
    }),
    BullModule.registerQueue({
      name: 'ai-reply',
    }),
    ClientsModule.register([
      {
        name: 'AI_AGENT_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'agent', // Matches the 'package' in proto file
          protoPath: join(__dirname, '../proto/agent.proto'),
          url: 'localhost:50051', // Where Python is running
        },
      },
    ]),
  ],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    WebhooksProcessor,
    AiReplyProcessor,
    WhatsappService,
    WhatsappMediaService,
    ActionExecutorService,
    NotificationEmitterService,
  ],
  exports: [WhatsappService, ActionExecutorService],
})
export class WebhooksModule {}
