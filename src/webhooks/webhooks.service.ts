import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { WhatsAppWebhookPayload } from './interfaces/whatsapp.interface';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectQueue('whatsapp-messages') private readonly messageQueue: Queue,
    private readonly configService: ConfigService,
  ) {}

  isValidMetaSignature(
    rawBody: Buffer,
    signature: string | undefined,
  ): boolean {
    const appSecret = this.configService.get<string>('META_APP_SECRET');
    if (!appSecret || !signature?.startsWith('sha256=')) return false;
    const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    const supplied = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return (
      supplied.length === expectedBuffer.length &&
      timingSafeEqual(supplied, expectedBuffer)
    );
  }

  async queueIncomingMessage(payload: WhatsAppWebhookPayload) {
    // Add the payload to Redis. We will process this later in a separate worker.
    const ids = payload.entry.flatMap((entry) =>
      entry.changes.flatMap(
        (change) => change.value.messages?.map((message) => message.id) ?? [],
      ),
    );
    // A status-only webhook has no message id; use a hash-sized stable value
    // derived from the payload rather than treating it as a delivery candidate.
    const jobId = `inbound-${createHmac('sha256', 'webhook')
      .update(ids.length ? ids.sort().join('\0') : JSON.stringify(payload))
      .digest('hex')}`;
    await this.messageQueue.add('process-webhook', payload, {
      jobId,
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: false, // Failed jobs are the operational DLQ and remain inspectable.
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    this.logger.log('WhatsApp webhook payload queued successfully.');
  }
}
