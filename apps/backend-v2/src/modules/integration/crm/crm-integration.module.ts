import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CrmIntegrationService } from './crm-integration.service';
import { HubspotAdapter } from './adapters/hubspot.adapter';
import { ZohoAdapter } from './adapters/zoho.adapter';
import { CredentialsModule } from '../../../credentials/credentials.module';

@Module({
  imports: [HttpModule, CredentialsModule],
  providers: [CrmIntegrationService, HubspotAdapter, ZohoAdapter],
  exports: [CrmIntegrationService, HubspotAdapter],
})
export class CrmIntegrationModule {}
