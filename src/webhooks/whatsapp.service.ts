import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface MetaMessageResponse {
  messaging_product: string;
  contacts: { input: string; wa_id: string }[];
  messages: { id: string }[];
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly apiUrl = 'https://graph.facebook.com/v25.0'; // Or whichever version Meta is currently on

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async sendTextMessage(
    toPhoneNumber: string,
    accessToken: string,
    phoneNumberId: string,
    message: string,
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
    };

    return this.postToMeta(phoneNumberId, accessToken, payload);
  }

  async sendImageMessage(
    toPhoneNumber: string,
    accessToken: string,
    phoneNumberId: string,
    imageUrl: string,
    caption?: string,
  ): Promise<MetaMessageResponse> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toPhoneNumber,
      type: 'image',
      image: {
        link: imageUrl,
        ...(caption && { caption }),
      },
    };

    return this.postToMeta(phoneNumberId, accessToken, payload);
  }

  async sendTypingIndicator(
    accessToken: string,
    phoneNumberId: string,
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

    return this.postToMeta(phoneNumberId, accessToken, payload);
  }

  private async postToMeta(
    phoneNumberId: string,
    accessToken: string,
    payload: any,
  ): Promise<MetaMessageResponse> {
    if (!phoneNumberId || !accessToken) {
      this.logger.error('Missing WhatsApp credentials for this organization.');
      throw new Error('Missing WhatsApp credentials');
    }

    const url = `${this.apiUrl}/${phoneNumberId}/messages`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      this.logger.log(
        `Successfully sent ${payload.type} message to ${payload.to}`,
      );
      return response.data as MetaMessageResponse;
    } catch (error: any) {
      this.logger.error(
        `Failed to send WhatsApp message: ${error?.response?.data?.error?.message || error.message}`,
      );
      throw error;
    }
  }
}
