import { IIntegrationProvider } from './integration-provider.interface';

export interface ICrmProvider extends IIntegrationProvider {
  /**
   * Syncs a lead/contact to the CRM.
   */
  syncLead(
    credentialId: string,
    organizationId: string,
    leadData: any,
  ): Promise<any>;

  /**
   * Fetches contact details from the CRM.
   */
  fetchContact(
    credentialId: string,
    organizationId: string,
    externalContactId: string,
  ): Promise<any>;
}
