import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { EventsModule } from '../events/events.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ToolsController } from './tools.controller';

@Module({
  imports: [EventsModule, WebhooksModule],
  providers: [ConversationsService],
  controllers: [ConversationsController, ToolsController],
})
export class ConversationsModule {}
