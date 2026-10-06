import { metaGraphUrl } from '../config/meta-graph';
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, throwError } from 'rxjs';
import { catchError, retry, timeout } from 'rxjs/operators';
import { IChannelProvider } from '../core/interfaces/channel-provider.interface';
import { CredentialsService } from '../credentials/credentials.service';

/** Raised before any provider I/O: the message was definitely not sent. */
export class OutboundNotSentError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'OutboundNotSentError';
  }
}

export interface MetaMessageResponse {
  messaging_product: string;
  contacts: { input: string; wa_id: string }[];
  messages: { id: string }[];
}

@Injectable()
export class WhatsappService implements IChannelProvider {
  private readonly logger = new Logger(WhatsappService.name);
  private get apiUrl() {
    return metaGraphUrl(this.configService);
  }

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
    } catch {
      await this.credentials.recordVerification(
        organizationId,
        credentialId,
        false,
        'WHATSAPP_CREDENTIAL_VERIFICATION_FAILED',
      );
      return false;
    }
  }

  async reconnect(
    credentialId: string,
    organizationId: string,
    newPayload: any,
  ): Promise<void> {
    await this.credentials.rotate(
      organizationId,
      credentialId,
      newPayload as Record<string, string>,
    );
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
    // Failures before the POST mean Meta was never contacted: the message
    // was certainly not sent, so they must not become UNKNOWN (KI-029).
    let accessToken: string | undefined;
    let phoneNumberId: string | undefined;
    try {
      ({ accessToken, phoneNumberId } = await this.credentials.readActive(
        organizationId,
        credentialId,
      ));
    } catch {
      this.logger.error('WHATSAPP_CREDENTIAL_UNAVAILABLE');
      throw new OutboundNotSentError('LOCAL_CREDENTIAL_UNAVAILABLE');
    }

    const activePhoneNumberId = providerAccountIdOverride || phoneNumberId;
    if (!activePhoneNumberId || !accessToken) {
      this.logger.error('Missing WhatsApp credentials for this organization.');
      throw new OutboundNotSentError('LOCAL_CREDENTIAL_MISSING');
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
            // A timed-out POST may have been accepted. Retrying at HTTP level
            // can send a second patient-visible message.
            catchError((error) => throwError(() => error)),
          ),
      );

      this.logger.log('WHATSAPP_SEND_COMPLETE');
      return response.data as MetaMessageResponse;
    } catch (error: any) {
      this.logger.error('WHATSAPP_SEND_FAILED');

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
