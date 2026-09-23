import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
import { ExternalCrmType } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, throwError, timer } from 'rxjs';
import { catchError, retry, timeout } from 'rxjs/operators';
import type { CrmAdapter } from '../crm-adapter.interface';
import { CrmIntegrationService } from '../crm-integration.service';
import { CredentialsService } from '../../../../credentials/credentials.service';
import { ICrmProvider } from '../../../../core/interfaces/crm-provider.interface';
import { PrismaService } from '../../../../prisma/prisma.service';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

@Injectable()
export class HubspotAdapter implements CrmAdapter, ICrmProvider, OnModuleInit {
  private readonly logger = new Logger(HubspotAdapter.name);

  constructor(
    private readonly crmIntegrationService: CrmIntegrationService,
    private readonly credentials: CredentialsService,
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.crmIntegrationService.registerAdapter(ExternalCrmType.HUB_SPOT, this);
  }

  // --- ICrmProvider Contract ---

  async verifyCredentials(
    credentialId: string,
    organizationId: string,
  ): Promise<boolean> {
    try {
      const { accessToken } = await this.credentials.readActive(
        organizationId,
        credentialId,
      );
      if (!accessToken) return false;

      const url = `${HUBSPOT_API_BASE}/crm/v3/objects/contacts?limit=1`;
      await firstValueFrom(
        this.httpService
          .get(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          .pipe(
            timeout(5000),
            retry({ count: 2, delay: 1000 }),
            catchError((error) => throwError(() => error)),
          ),
      );
      await this.credentials.recordVerification(
        organizationId,
        credentialId,
        true,
      );
      return true;
    } catch (error) {
      await this.credentials.recordVerification(
        organizationId,
        credentialId,
        false,
        error instanceof Error ? error.message : 'Unknown error',
      );
      return false;
    }
  }

  async reconnect(
    credentialId: string,
    organizationId: string,
    newPayload: any,
  ): Promise<void> {
    await this.credentials.rotate(organizationId, credentialId, newPayload);
    await this.verifyCredentials(credentialId, organizationId);
  }

  async disconnect(
    credentialId: string,
    organizationId: string,
  ): Promise<void> {
    await this.credentials.revoke(
      organizationId,
      credentialId,
      'Disconnected via HubSpot Adapter',
    );
  }

  async syncLead(
    credentialId: string,
    organizationId: string,
    leadData: any,
  ): Promise<any> {
    // This satisfies ICrmProvider but we keep using CrmAdapter methods for the actual sync sequence
    const contactId = await this.syncContact(leadData, credentialId);
    const dealId = await this.syncDeal(contactId, leadData, credentialId);
    return { externalContactId: contactId, externalDealId: dealId };
  }

  async fetchContact(
    credentialId: string,
    organizationId: string,
    externalContactId: string,
  ): Promise<any> {
    const { accessToken } = await this.credentials.readActive(
      organizationId,
      credentialId,
    );
    if (!accessToken)
      throw new InternalServerErrorException('Missing HubSpot credentials');

    const url = `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/${externalContactId}`;
    try {
      const response = await firstValueFrom(
        this.httpService
          .get(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          .pipe(
            timeout(5000),
            retry({ count: 2, delay: 1000 }),
            catchError((error) => throwError(() => error)),
          ),
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch contact from HubSpot: ${error?.response?.data?.message || error.message}`,
      );
      throw error;
    }
  }

  // --- CrmAdapter Contract ---

  async syncContact(lead: any, overrideCredentialId?: string): Promise<string> {
    // Determine credential ID based on organization's connected channel or override
    const credentialId =
      overrideCredentialId ||
      (await this.getCredentialIdForOrg(lead.organizationId));
    const { accessToken } = await this.credentials.readActive(
      lead.organizationId,
      credentialId,
    );

    const properties = {
      firstname: lead.firstName || '',
      lastname: lead.lastName || '',
      phone: lead.phoneNumber || '',
      email: lead.email || '',
      country: lead.country || '',
    };

    try {
      const { data } = await firstValueFrom(
        this.httpService
          .post(
            `${HUBSPOT_API_BASE}/crm/v3/objects/contacts`,
            { properties },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            },
          )
          .pipe(
            timeout(8000),
            retry({
              count: 2,
              delay: (e, retryCount) =>
                e.response?.status === 409 || e.response?.status === 401
                  ? throwError(() => e)
                  : timer(1000 * retryCount),
            }),
            catchError((error) => throwError(() => error)),
          ),
      );

      this.logger.log(
        `Created HubSpot contact: ${data.id} for Org: ${lead.organizationId}`,
      );
      return data.id;
    } catch (error: any) {
      if (error.response?.status === 409) {
        return this.handleExistingContact(accessToken, error, properties);
      }
      if (error.response?.status === 401) {
        await this.credentials.recordVerification(
          lead.organizationId,
          credentialId,
          false,
          'Auth failed in syncContact',
        );
      }
      this.logger.error(
        `HubSpot syncContact failed: ${error.response?.data?.message || error.message}`,
      );
      throw error;
    }
  }

  private async handleExistingContact(
    accessToken: string,
    error: any,
    properties: Record<string, string>,
  ): Promise<string> {
    const existingId =
      error.response?.data?.message?.match(/Existing ID:\s*(\d+)/)?.[1];
    if (!existingId) {
      this.logger.warn(
        'Contact conflict detected but could not extract existing ID. Re-throwing.',
      );
      throw error;
    }

    this.logger.log(
      `Contact already exists in HubSpot (ID: ${existingId}). Updating...`,
    );

    await firstValueFrom(
      this.httpService
        .patch(
          `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/${existingId}`,
          { properties },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        )
        .pipe(
          timeout(8000),
          retry({ count: 2, delay: 1000 }),
          catchError((e) => throwError(() => e)),
        ),
    );

    return existingId;
  }

  async syncDeal(
    contactId: string,
    lead: any,
    overrideCredentialId?: string,
  ): Promise<string> {
    const credentialId =
      overrideCredentialId ||
      (await this.getCredentialIdForOrg(lead.organizationId));
    const { accessToken } = await this.credentials.readActive(
      lead.organizationId,
      credentialId,
    );

    const dealName =
      `${lead.firstName || 'Lead'} ${lead.lastName || ''} – ${lead.status || 'NEW'}`.trim();
    const properties: Record<string, any> = {
      dealname: dealName,
      dealstage: this.mapLeadStatusToHubSpotStage(lead.status),
      pipeline: 'default',
    };

    if (lead.estimatedValue) properties.amount = String(lead.estimatedValue);

    try {
      const { data } = await firstValueFrom(
        this.httpService
          .post(
            `${HUBSPOT_API_BASE}/crm/v3/objects/deals`,
            {
              properties,
              associations: [
                {
                  to: { id: contactId },
                  types: [
                    {
                      associationCategory: 'HUBSPOT_DEFINED',
                      associationTypeId: 3,
                    },
                  ],
                },
              ],
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            },
          )
          .pipe(
            timeout(8000),
            retry({
              count: 2,
              delay: (e, retryCount) =>
                e.response?.status === 401
                  ? throwError(() => e)
                  : timer(1000 * retryCount),
            }),
            catchError((error) => throwError(() => error)),
          ),
      );

      this.logger.log(
        `Created HubSpot deal: ${data.id} for Org: ${lead.organizationId}`,
      );
      return data.id;
    } catch (error: any) {
      if (error.response?.status === 401) {
        await this.credentials.recordVerification(
          lead.organizationId,
          credentialId,
          false,
          'Auth failed in syncDeal',
        );
      }
      this.logger.error(
        `HubSpot syncDeal failed: ${error.response?.data?.message || error.message}`,
      );
      throw error;
    }
  }

  // Helper to find the correct credential since CrmAdapter methods don't pass it currently
  private async getCredentialIdForOrg(organizationId: string): Promise<string> {
    const cred = await this.prisma.credential.findFirst({
      where: {
        organizationId,
        provider: 'HUBSPOT',
        status: 'ACTIVE',
      },
    });
    if (!cred) {
      throw new InternalServerErrorException(
        `No active HubSpot credential found for organization ${organizationId}`,
      );
    }
    return cred.id;
  }

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
