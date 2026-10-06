import { AuthModule } from '../auth/auth.module';
import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { CrmIntegrationModule } from '../modules/integration/crm/crm-integration.module';
import { CredentialsModule } from '../credentials/credentials.module';

@Module({
  imports: [
    WebhooksModule,
    AuthModule,
    CrmIntegrationModule,
    CredentialsModule,
  ],
  controllers: [ChannelsController],
  providers: [ChannelsService],
})
export class ChannelsModule {}
