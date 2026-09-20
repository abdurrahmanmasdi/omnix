import { Injectable, Logger, OnModuleInit, InternalServerErrorException } from '@nestjs/common';
import { ExternalCrmType } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, throwError, timer } from 'rxjs';
import { catchError, retry, timeout } from 'rxjs/operators';
import type { CrmAdapter } from '../crm-adapter.interface';
import { CrmIntegrationService } from '../crm-integration.service';
import { ICrmProvider } from '../../../../core/interfaces/crm-provider.interface';
import { CredentialsService } from '../../../../credentials/credentials.service';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class ZohoAdapter implements CrmAdapter, ICrmProvider, OnModuleInit {
  private readonly logger = new Logger(ZohoAdapter.name);
  private readonly apiUrl = 'https://www.zohoapis.com/crm/v6';

  constructor(
    private readonly crmIntegrationService: CrmIntegrationService,
    private readonly credentials: CredentialsService,
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.crmIntegrationService.registerAdapter(ExternalCrmType.ZOHO, this);
  }

  // --- ICrmProvider Contract ---

  async verifyCredentials(credentialId: string, organizationId: string): Promise<boolean> {
    try {
      const { accessToken } = await this.credentials.readActive(organizationId, credentialId);
      if (!accessToken) return false;

      const url = `${this.apiUrl}/Leads?page=1&per_page=1`;
      await firstValueFrom(
        this.httpService.get(url, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        }).pipe(
          timeout(5000),
          retry({ count: 2, delay: 1000 }),
          catchError((error) => throwError(() => error))
        ),
      );
      await this.credentials.recordVerification(organizationId, credentialId, true);
      return true;
    } catch (error) {
      await this.credentials.recordVerification(organizationId, credentialId, false, error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  async reconnect(credentialId: string, organizationId: string, newPayload: any): Promise<void> {
    await this.credentials.rotate(organizationId, credentialId, newPayload);
    await this.verifyCredentials(credentialId, organizationId);
  }

  async disconnect(credentialId: string, organizationId: string): Promise<void> {
    await this.credentials.revoke(organizationId, credentialId, 'Disconnected via Zoho Adapter');
  }

  async syncLead(credentialId: string, organizationId: string, leadData: any): Promise<any> {
    const contactId = await this.syncContact(leadData, credentialId);
    const dealId = await this.syncDeal(contactId, leadData, credentialId);
    return { externalContactId: contactId, externalDealId: dealId };
  }

  async fetchContact(credentialId: string, organizationId: string, externalContactId: string): Promise<any> {
    const { accessToken } = await this.credentials.readActive(organizationId, credentialId);
    if (!accessToken) throw new InternalServerErrorException('Missing Zoho credentials');

    const url = `${this.apiUrl}/Leads/${externalContactId}`;
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        }).pipe(
          timeout(5000),
          retry({ count: 2, delay: 1000 }),
          catchError((error) => throwError(() => error))
        )
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to fetch contact from Zoho: ${error?.response?.data?.message || error.message}`);
      throw error;
    }
  }

  // --- CrmAdapter Contract ---

  async syncContact(lead: any, overrideCredentialId?: string): Promise<string> {
    const credentialId = overrideCredentialId || await this.getCredentialIdForOrg(lead.organizationId);
    const { accessToken } = await this.credentials.readActive(lead.organizationId, credentialId);

    const payload = {
      data: [{
        First_Name: lead.firstName || '',
        Last_Name: lead.lastName || 'Unknown',
        Email: lead.email || '',
        Phone: lead.phoneNumber || '',
      }]
    };

    try {
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.apiUrl}/Contacts`, payload, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
        }).pipe(
          timeout(8000),
          retry({ count: 2, delay: (e, retryCount) => (e.response?.status === 401) ? throwError(() => e) : timer(1000 * retryCount) }),
          catchError((error) => throwError(() => error))
        )
      );

      const contactId = data.data?.[0]?.details?.id;
      this.logger.log(`Created Zoho contact: ${contactId} for Org: ${lead.organizationId}`);
      return contactId;
    } catch (error: any) {
      if (error.response?.status === 401) {
        await this.credentials.recordVerification(lead.organizationId, credentialId, false, 'Auth failed in syncContact');
      }
      this.logger.error(`Zoho syncContact failed: ${error.response?.data?.message || error.message}`);
      throw error;
    }
  }

  async syncDeal(contactId: string, lead: any, overrideCredentialId?: string): Promise<string> {
    const credentialId = overrideCredentialId || await this.getCredentialIdForOrg(lead.organizationId);
    const { accessToken } = await this.credentials.readActive(lead.organizationId, credentialId);

    const dealName = `${lead.firstName || 'Lead'} ${lead.lastName || ''} – ${lead.status || 'NEW'}`.trim();
    
    const payload = {
      data: [{
        Deal_Name: dealName,
        Stage: this.mapLeadStatusToZohoStage(lead.status),
        Contact_Name: { id: contactId },
        Amount: lead.estimatedValue || 0,
      }]
    };

    try {
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.apiUrl}/Deals`, payload, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
        }).pipe(
          timeout(8000),
          retry({ count: 2, delay: (e, retryCount) => e.response?.status === 401 ? throwError(() => e) : timer(1000 * retryCount) }),
          catchError((error) => throwError(() => error))
        )
      );

      const dealId = data.data?.[0]?.details?.id;
      this.logger.log(`Created Zoho deal: ${dealId} for Org: ${lead.organizationId}`);
      return dealId;
    } catch (error: any) {
      if (error.response?.status === 401) {
        await this.credentials.recordVerification(lead.organizationId, credentialId, false, 'Auth failed in syncDeal');
      }
      this.logger.error(`Zoho syncDeal failed: ${error.response?.data?.message || error.message}`);
      throw error;
    }
  }

  private async getCredentialIdForOrg(organizationId: string): Promise<string> {
    const cred = await this.prisma.credential.findFirst({
      where: {
        organizationId,
        provider: 'ZOHO',
        status: 'ACTIVE'
      }
    });
    if (!cred) {
      throw new InternalServerErrorException(`No active Zoho credential found for organization ${organizationId}`);
    }
    return cred.id;
  }

  private mapLeadStatusToZohoStage(status?: string): string {
    const stageMap: Record<string, string> = {
      NEW: 'Qualification',
      QUALIFYING: 'Needs Analysis',
      QUALIFIED: 'Value Proposition',
      READY_TO_BOOK: 'Identify Decision Makers',
      READY_TO_PAY: 'Proposal/Price Quote',
      WON: 'Closed Won',
      LOST: 'Closed Lost',
    };
    return stageMap[status || 'NEW'] || 'Qualification';
  }
}
