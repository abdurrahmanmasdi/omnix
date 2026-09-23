import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, throwError, timer } from 'rxjs';
import { catchError, retry, timeout } from 'rxjs/operators';
import { IChannelProvider } from '../core/interfaces/channel-provider.interface';
import { CredentialsService } from '../credentials/credentials.service';

export interface MetaMessageResponse {
  messaging_product: string;
  contacts: { input: string; wa_id: string }[];
  messages: { id: string }[];
}

@Injectable()
export class WhatsappService implements IChannelProvider {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly apiUrl = 'https://graph.facebook.com/v25.0';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly credentials: CredentialsService,
  ) {}

  async verifyCredentials(
    credentialId: string,
    organizationId: string,
  ): Promise<boolean> {
    try {
      const { accessToken, phoneNumberId } = await this.credentials.readActive(
        organizationId,
        credentialId,
      );
      if (!accessToken || !phoneNumberId) return false;

      const url = `${this.apiUrl}/${phoneNumberId}`;
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
      'Disconnected via WhatsApp Provider',
    );
  }

  async sendTextMessage(
    credentialId: string,
    organizationId: string,
    toPhoneNumber: string,
    message: string,
    providerAccountId?: string,
    idempotencyKey?: string,
  ): Promise<MetaMessageResponse> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toPhoneNumber,
      type: 'text',
      text: {
        preview_url: false,
        body: message,
      },
      ...(idempotencyKey && { biz_opaque_callback_data: idempotencyKey }),
    };
    return this.postToMeta(
      credentialId,
      organizationId,
      payload,
      providerAccountId,
    );
  }

  async sendMediaMessage(
    credentialId: string,
    organizationId: string,
    toPhoneNumber: string,
    mediaUrl: string,
    caption?: string,
    providerAccountId?: string,
    idempotencyKey?: string,
  ): Promise<MetaMessageResponse> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toPhoneNumber,
      type: 'image',
      image: {
        link: mediaUrl,
        ...(caption && { caption }),
      },
      ...(idempotencyKey && { biz_opaque_callback_data: idempotencyKey }),
    };
    return this.postToMeta(
      credentialId,
      organizationId,
      payload,
      providerAccountId,
    );
  }

  async sendTypingIndicator(
    credentialId: string,
    organizationId: string,
    messageId: string,
  ): Promise<any> {
    const payload = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
      typing_indicator: {
        type: 'text',
      },
    };
    return this.postToMeta(credentialId, organizationId, payload);
  }

  private async postToMeta(
    credentialId: string,
    organizationId: string,
    payload: any,
    providerAccountIdOverride?: string,
  ): Promise<MetaMessageResponse> {
    const { accessToken, phoneNumberId } = await this.credentials.readActive(
      organizationId,
      credentialId,
    );

    const activePhoneNumberId = providerAccountIdOverride || phoneNumberId;
    if (!activePhoneNumberId || !accessToken) {
      this.logger.error('Missing WhatsApp credentials for this organization.');
      throw new InternalServerErrorException('Missing WhatsApp credentials');
    }

    const url = `${this.apiUrl}/${activePhoneNumberId}/messages`;

    try {
      const response = await firstValueFrom(
        this.httpService
          .post(url, payload, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          })
          .pipe(
            timeout(8000),
            retry({
              count: 3,
              delay: (error, retryCount) => {
                if (error.response?.status === 401) throw error; // Don't retry auth errors
                return timer(Math.pow(2, retryCount) * 500); // Exponential backoff: 1s, 2s, 4s
              },
            }),
            catchError((error) => throwError(() => error)),
          ),
      );

      this.logger.log(
        `Successfully sent ${payload.type} message to ${payload.to}`,
      );
      return response.data as MetaMessageResponse;
    } catch (error: any) {
      this.logger.error(
        `Failed to send WhatsApp message: ${error?.response?.data?.error?.message || error.message}`,
      );

      // If it's an auth error (401), record verification failure
      if (error?.response?.status === 401) {
        await this.credentials.recordVerification(
          organizationId,
          credentialId,
          false,
          'Authentication failed during message send',
        );
      }

      throw error;
    }
  }
}
