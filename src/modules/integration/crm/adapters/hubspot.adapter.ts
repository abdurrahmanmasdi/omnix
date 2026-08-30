import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ExternalCrmType } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import type { CrmAdapter } from '../crm-adapter.interface';
import { CrmIntegrationService } from '../crm-integration.service';
import { PrismaService } from '../../../../prisma/prisma.service';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

/**
 * HubSpot CRM Adapter (Multi-Tenant)
 *
 * Maps OmniDesk leads to HubSpot Contacts and Deals via REST API v3.
 * Dynamically resolves tenant-specific access tokens from the Organization model.
 * Self-registers with the CrmIntegrationService at bootstrap.
 */
@Injectable()
export class HubspotAdapter implements CrmAdapter, OnModuleInit {
  private readonly logger = new Logger(HubspotAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crmIntegrationService: CrmIntegrationService,
  ) {}

  onModuleInit() {
    this.crmIntegrationService.registerAdapter(ExternalCrmType.HUB_SPOT, this);
  }

  /**
   * Helper to dynamically instantiate an authenticated Axios client
   * using the organization's stored HubSpot token.
   */
  private async getClientForOrganization(organizationId: string): Promise<AxiosInstance> {
    if (!organizationId) {
      throw new Error('Cannot sync to HubSpot: Lead has no organizationId.');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { crmAccessToken: true, name: true },
    });

    if (!organization?.crmAccessToken) {
      const msg = `HubSpot sync skipped: Organization ${organizationId} (${organization?.name || 'Unknown'}) has not connected HubSpot (missing crmAccessToken).`;
      this.logger.warn(msg);
      throw new Error(msg);
    }

    return axios.create({
      baseURL: HUBSPOT_API_BASE,
      headers: {
        Authorization: `Bearer ${organization.crmAccessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  // ─── Contact Sync ────────────────────────────────────────

  async syncContact(lead: any): Promise<string> {
    const client = await this.getClientForOrganization(lead.organizationId);

    const properties = {
      firstname: lead.firstName || '',
      lastname: lead.lastName || '',
      phone: lead.phoneNumber || '',
      email: lead.email || '',
      country: lead.country || '',
    };

    try {
      // Attempt to create the contact
      const { data } = await client.post(
        '/crm/v3/objects/contacts',
        { properties },
      );

      this.logger.log(`Created HubSpot contact: ${data.id} for Org: ${lead.organizationId}`);
      return data.id;
    } catch (error: any) {
      // HubSpot returns 409 when the contact already exists
      if (error.response?.status === 409) {
        return this.handleExistingContact(client, error, properties);
      }
      this.logger.error(
        `HubSpot syncContact failed for Org ${lead.organizationId}: ${error.response?.data?.message || error.message}`,
      );
      throw error;
    }
  }

  /**
   * When HubSpot returns 409 Conflict, the error body contains the
   * existing contact ID. We extract it and update instead.
   */
  private async handleExistingContact(
    client: AxiosInstance,
    error: any,
    properties: Record<string, string>,
  ): Promise<string> {
    const existingId = error.response?.data?.message?.match(
      /Existing ID:\s*(\d+)/,
    )?.[1];

    if (!existingId) {
      this.logger.warn(
        'Contact conflict detected but could not extract existing ID. Re-throwing.',
      );
      throw error;
    }

    this.logger.log(
      `Contact already exists in HubSpot (ID: ${existingId}). Updating...`,
    );

    await client.patch(
      `/crm/v3/objects/contacts/${existingId}`,
      { properties },
    );

    return existingId;
  }

  // ─── Deal Sync ───────────────────────────────────────────

  async syncDeal(contactId: string, lead: any): Promise<string> {
    const client = await this.getClientForOrganization(lead.organizationId);

    const dealName = `${lead.firstName || 'Lead'} ${lead.lastName || ''} – ${lead.status || 'NEW'}`.trim();

    const properties: Record<string, any> = {
      dealname: dealName,
      dealstage: this.mapLeadStatusToHubSpotStage(lead.status),
      pipeline: 'default',
    };

    if (lead.estimatedValue) {
      properties.amount = String(lead.estimatedValue);
    }

    try {
      const { data } = await client.post(
        '/crm/v3/objects/deals',
        {
          properties,
          associations: [
            {
              to: { id: contactId },
              types: [
                {
                  associationCategory: 'HUBSPOT_DEFINED',
                  associationTypeId: 3, // Deal-to-Contact
                },
              ],
            },
          ],
        },
      );

      this.logger.log(`Created HubSpot deal: ${data.id} for Org: ${lead.organizationId}`);
      return data.id;
    } catch (error: any) {
      this.logger.error(
        `HubSpot syncDeal failed for Org ${lead.organizationId}: ${error.response?.data?.message || error.message}`,
      );
      throw error;
    }
  }

  // ─── Helpers ─────────────────────────────────────────────

  /**
   * Maps our internal LeadStatus to HubSpot's default deal stages.
   * Customize these stage IDs if the org uses a custom pipeline.
   */
  private mapLeadStatusToHubSpotStage(status?: string): string {
    const stageMap: Record<string, string> = {
      NEW: 'appointmentscheduled',
      QUALIFYING: 'qualifiedtobuy',
      QUALIFIED: 'qualifiedtobuy',
      READY_TO_BOOK: 'presentationscheduled',
      READY_TO_PAY: 'contractsent',
      WON: 'closedwon',
      LOST: 'closedlost',
    };

    return stageMap[status || 'NEW'] || 'appointmentscheduled';
  }
}

