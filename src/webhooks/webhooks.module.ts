import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhooksProcessor } from './webhooks.processor';
import { WhatsappService } from './whatsapp.service';
import { InstagramService } from './instagram.service';
import { EventsModule } from '../events/events.module';
import { AiReplyProcessor } from './ai-reply.processor';
import { NotificationEmitterService } from '../notifications/notification-emitter.service';
import { ActionExecutorService } from './action-executor.service';
import { CrmIntegrationModule } from '../modules/integration/crm/crm-integration.module';
import { WhatsappMediaService } from './whatsapp-media.service';
import { GRPC_CONFIG } from '../config/grpc.constants';
import { CredentialsModule } from '../credentials/credentials.module';

import { FollowUpService } from '../follow-ups/follow-up.service';
import { FollowUpProcessor } from '../follow-ups/follow-up.processor';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    HttpModule,
    EventsModule,
    CrmIntegrationModule,
    AuditModule,
    CredentialsModule,
    // Register the specific queue we will push messages to
    BullModule.registerQueue({
      name: 'whatsapp-messages',
      defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnFail: false },
    }),
    BullModule.registerQueue({
      name: 'ai-reply',
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnFail: false },
    }),
    BullModule.registerQueue({
      name: 'follow-up',
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnFail: false },
    }),
    ClientsModule.register([
      {
        name: 'AI_AGENT_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'agent', // Matches the 'package' in proto file
          protoPath: GRPC_CONFIG.PROTO_PATHS.AGENT,
          url: GRPC_CONFIG.PYTHON_SERVER_URL,
        },
      },
    ]),
  ],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    WebhooksProcessor,
    AiReplyProcessor,
    FollowUpService,
    FollowUpProcessor,
    WhatsappService,
    InstagramService,
    WhatsappMediaService,
    ActionExecutorService,
    NotificationEmitterService,
  ],
  exports: [WhatsappService, InstagramService, ActionExecutorService, FollowUpService],
})
export class WebhooksModule {}
