import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class ChatRedisSubscriberService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ChatRedisSubscriberService.name);
  private client: RedisClientType | null = null;

  constructor(private readonly chatGateway: ChatGateway) {}

  async onModuleInit(): Promise<void> {
    const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
    this.client = createClient({ url });

    this.client.on('error', (err) =>
      this.logger.error(`Redis subscriber error: ${err}`),
    );

    await this.client.connect();

    // Subscribe using the callback API which provides the message payload.
    await this.client.subscribe('chat_events', (raw) =>
      this.handleMessage(raw as string),
    );

    this.logger.log('ChatRedisSubscriberService subscribed to chat_events');
  }

  private handleMessage(rawMessage: string) {
    try {
      const payload = JSON.parse(rawMessage) as Record<string, any>;

      // Validate shape minimally
      const orgId = payload.organizationId as string | undefined;
      if (!orgId) {
        this.logger.warn('Received chat_events message without organizationId');
        return;
      }

      // Emit to both canonical rooms to be robust: plain orgId and prefixed room
      try {
        this.chatGateway.server.to(orgId).emit('new_message', payload);
      } catch (err) {
        this.logger.error(`Failed to emit to room ${orgId}: ${err}`);
      }

      try {
        this.chatGateway.server.to(`org:${orgId}`).emit('new_message', payload);
      } catch (err) {
        this.logger.error(`Failed to emit to room org:${orgId}: ${err}`);
      }
    } catch (err) {
      this.logger.error(`Failed to parse redis message: ${err}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    try {
      // Best-effort unsubscribe and disconnect
      try {
        await this.client.unsubscribe('chat_events');
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {
        // ignore
      }
      await this.client.disconnect();
      this.logger.log('ChatRedisSubscriberService disconnected');
    } catch (err) {
      this.logger.error(`Error shutting down Redis subscriber: ${err}`);
    }
  }
}
