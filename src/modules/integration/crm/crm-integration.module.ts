import { Module } from '@nestjs/common';
import { CrmIntegrationService } from './crm-integration.service';
import { HubspotAdapter } from './adapters/hubspot.adapter';

@Module({
  providers: [CrmIntegrationService, HubspotAdapter],
  exports: [CrmIntegrationService],
})
export class CrmIntegrationModule {}
