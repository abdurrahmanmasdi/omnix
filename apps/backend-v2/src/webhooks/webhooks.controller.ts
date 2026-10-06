import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Headers,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
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
    if (!mode || !token) {
      throw new BadRequestException('Missing hub.mode or hub.verify_token');
    }

    const verifyToken = this.configService.get<string>('META_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      return challenge; // Meta requires us to return this exact string back to them
    }

    throw new ForbiddenException('Invalid verification token');
  }

  // 2. Receiving Messages (POST)
  @Post('whatsapp')
  @HttpCode(HttpStatus.OK) // ALWAYS return 200 OK immediately!
  async receiveMessage(
    @Body() payload: WhatsAppWebhookPayload,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() request: Request & { rawBody?: Buffer },
  ) {
    const rawBody = request.rawBody;
    if (
      !rawBody ||
      !this.webhooksService.isValidMetaSignature(rawBody, signature)
    ) {
      throw new UnauthorizedException('Invalid Meta webhook signature');
    }
    // Check if it's a valid WhatsApp API payload
    if (payload.object === 'whatsapp_business_account') {
      // Queue only authenticated payloads. Queue-level de-duplication means a
      // Meta retry cannot create a second worker for the same delivery.
      await this.webhooksService.queueIncomingMessage(payload);
    }

    return 'EVENT_RECEIVED';
  }
}
