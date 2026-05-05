import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { WhatsAppWebhookPayload } from './interfaces/whatsapp.interface';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectQueue('whatsapp-messages') private readonly messageQueue: Queue,
  ) {}

  async queueIncomingMessage(payload: WhatsAppWebhookPayload) {
    // Add the payload to Redis. We will process this later in a separate worker.
    await this.messageQueue.add('process-webhook', payload, {
      removeOnComplete: true, // Keep Redis clean
      attempts: 3, // Retry 3 times if the worker fails
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    this.logger.log('WhatsApp webhook payload queued successfully.');
  }
}
