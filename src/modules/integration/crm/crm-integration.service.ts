import { Injectable, Logger } from '@nestjs/common';
import { ExternalCrmType } from '@prisma/client';
import type { CrmAdapter } from './crm-adapter.interface';

/**
 * CRM Integration Service (Factory Pattern)
 *
 * Dynamically selects the correct CRM adapter based on the lead's
 * `ExternalCrmType` and orchestrates the contact → deal sync sequence.
 */
@Injectable()
export class CrmIntegrationService {
  private readonly logger = new Logger(CrmIntegrationService.name);
  private readonly adapters = new Map<ExternalCrmType, CrmAdapter>();

  /**
   * Register a CRM adapter at bootstrap time.
   * Called by each adapter module's `onModuleInit`.
   */
  registerAdapter(type: ExternalCrmType, adapter: CrmAdapter): void {
    this.adapters.set(type, adapter);
    this.logger.log(`Registered CRM adapter: ${type}`);
  }

  /**
   * Orchestrates the full sync flow:
   *   1. Sync the contact (upsert in external CRM)
   *   2. Sync the deal linked to that contact
   *
   * @returns `{ externalContactId, externalDealId }` for the caller to persist.
   */
  async syncLeadToExternalCrm(
    lead: any,
    crmType: ExternalCrmType,
  ): Promise<{ externalContactId: string; externalDealId: string }> {
    if (crmType === ExternalCrmType.NONE) {
      this.logger.debug('CRM type is NONE — skipping external sync.');
      return { externalContactId: '', externalDealId: '' };
    }

    const adapter = this.adapters.get(crmType);
    if (!adapter) {
      throw new Error(
        `No CRM adapter registered for type "${crmType}". ` +
          `Available: [${[...this.adapters.keys()].join(', ')}]`,
      );
    }

    this.logger.log(
      `Syncing Lead ${lead.id} to ${crmType}...`,
    );

    // Step 1: Contact
    const externalContactId = await adapter.syncContact(lead);
    this.logger.log(
      `Contact synced → externalContactId: ${externalContactId}`,
    );

    // Step 2: Deal (linked to the contact we just created/updated)
    const externalDealId = await adapter.syncDeal(externalContactId, lead);
    this.logger.log(
      `Deal synced → externalDealId: ${externalDealId}`,
    );

    return { externalContactId, externalDealId };
  }
}
