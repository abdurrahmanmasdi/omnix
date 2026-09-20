import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, throwError, timer } from 'rxjs';
import { catchError, retry, timeout } from 'rxjs/operators';
import { IChannelProvider } from '../core/interfaces/channel-provider.interface';
import { CredentialsService } from '../credentials/credentials.service';

export interface MetaMessageResponse {
  recipient_id: string;
  message_id: string;
}

@Injectable()
export class InstagramService implements IChannelProvider {
  private readonly logger = new Logger(InstagramService.name);
  private readonly apiUrl = 'https://graph.facebook.com/v25.0';

  constructor(
    private readonly httpService: HttpService,
    private readonly credentials: CredentialsService,
  ) {}

  async verifyCredentials(credentialId: string, organizationId: string): Promise<boolean> {
    try {
      const { accessToken, instagramAccountId } = await this.credentials.readActive(organizationId, credentialId);
      if (!accessToken || !instagramAccountId) return false;

      const url = `${this.apiUrl}/${instagramAccountId}`;
      await firstValueFrom(
        this.httpService.get(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
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
    await this.credentials.revoke(organizationId, credentialId, 'Disconnected via Instagram Provider');
  }

  async sendTextMessage(
    credentialId: string,
    organizationId: string,
    toRecipientId: string,
    message: string,
    providerAccountId?: string,
  ): Promise<MetaMessageResponse> {
    const payload = {
      recipient: { id: toRecipientId },
      message: { text: message },
    };
    return this.postToMeta(credentialId, organizationId, payload, providerAccountId);
  }

  async sendMediaMessage(
    credentialId: string,
    organizationId: string,
    toRecipientId: string,
    mediaUrl: string,
    caption?: string,
    providerAccountId?: string,
  ): Promise<MetaMessageResponse> {
    const payload = {
      recipient: { id: toRecipientId },
      message: {
        attachment: {
          type: 'image',
          payload: { url: mediaUrl, is_reusable: true }
        }
      },
    };
    return this.postToMeta(credentialId, organizationId, payload, providerAccountId);
  }

  private async postToMeta(
    credentialId: string,
    organizationId: string,
    payload: any,
    providerAccountIdOverride?: string,
  ): Promise<MetaMessageResponse> {
    const { accessToken, instagramAccountId } = await this.credentials.readActive(organizationId, credentialId);
    
    const activeAccountId = providerAccountIdOverride || instagramAccountId;
    if (!activeAccountId || !accessToken) {
      this.logger.error('Missing Instagram credentials for this organization.');
      throw new InternalServerErrorException('Missing Instagram credentials');
    }

    const url = `${this.apiUrl}/${activeAccountId}/messages`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }).pipe(
          timeout(8000),
          retry({
            count: 3,
            delay: (error, retryCount) => {
              if (error.response?.status === 401) throw error; 
              return timer(Math.pow(2, retryCount) * 500); 
            }
          }),
          catchError((error) => throwError(() => error))
        )
      );

      this.logger.log(`Successfully sent message to ${payload.recipient.id}`);
      return response.data as MetaMessageResponse;
    } catch (error: any) {
      this.logger.error(`Failed to send Instagram message: ${error?.response?.data?.error?.message || error.message}`);
      
      if (error?.response?.status === 401) {
        await this.credentials.recordVerification(organizationId, credentialId, false, 'Authentication failed during message send');
      }
      
      throw error;
    }
  }
}
