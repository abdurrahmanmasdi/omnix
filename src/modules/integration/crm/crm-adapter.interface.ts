/**
 * CRM Adapter Interface
 *
 * Every external CRM integration (HubSpot, Zoho, etc.) must implement
 * this contract so the factory can swap adapters transparently.
 */
export interface CrmAdapter {
  /**
   * Push or update a contact in the external CRM.
   * @returns The external CRM's contact/lead ID.
   */
  syncContact(lead: any): Promise<string>;

  /**
   * Create or update a deal/opportunity linked to the external contact.
   * @returns The external CRM's deal ID.
   */
  syncDeal(contactId: string, lead: any): Promise<string>;
}
