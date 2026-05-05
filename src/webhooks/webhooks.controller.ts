import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhooksService } from './webhooks.service';
import type { WhatsAppWebhookPayload } from './interfaces/whatsapp.interface';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly configService: ConfigService,
  ) {}

  // 1. Meta Webhook Verification (GET)
  @Get('whatsapp')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const verifyToken = this.configService.get<string>('META_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      return challenge; // Meta requires us to return this exact string back to them
    }

    throw new UnauthorizedException('Invalid verification token');
  }

  // 2. Receiving Messages (POST)
  @Post('whatsapp')
  @HttpCode(HttpStatus.OK) // ALWAYS return 200 OK immediately!
  async receiveMessage(@Body() payload: WhatsAppWebhookPayload) {
    // Check if it's a valid WhatsApp API payload
    if (payload.object === 'whatsapp_business_account') {
      // Fire and forget: send to queue without waiting for DB or AI processing
      await this.webhooksService.queueIncomingMessage(payload);
    }

    return 'EVENT_RECEIVED';
  }
}
