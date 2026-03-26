import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';
import { Logger } from '@nestjs/common';

export class RedisIoAdapter extends IoAdapter {
  private pubClient: RedisClientType;
  private subClient: RedisClientType;
  private readonly logger = new Logger(RedisIoAdapter.name);

  async connectToRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    try {
      // Create pub client
      this.pubClient = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 500),
          connectTimeout: 5000,
        },
      }) as RedisClientType;

      // Create sub client by duplicating pub client
      this.subClient = this.pubClient.duplicate() as RedisClientType;

      // Set up event handlers
      this.pubClient.on('error', (error) => {
        this.logger.error(`[RedisIoAdapter] Pub client error: ${error}`);
      });

      this.subClient.on('error', (error) => {
        this.logger.error(`[RedisIoAdapter] Sub client error: ${error}`);
      });

      // Connect both clients
      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);

      this.logger.log('[RedisIoAdapter] Connected to Redis for Socket.IO');
    } catch (error) {
      this.logger.error(
        `[RedisIoAdapter] Failed to connect to Redis: ${error}`,
      );
      throw error;
    }
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const server = super.createIOServer(port, options);

    // Bind the Redis adapter to the Socket.IO server
    // The createAdapter function returns a type that Socket.IO expects but TypeScript
    // cannot properly infer due to type limitations in the redis-adapter library
    const redisAdapter = createAdapter(this.pubClient, this.subClient);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    server.adapter(redisAdapter);

    this.logger.log('[RedisIoAdapter] Redis adapter bound to Socket.IO server');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return server;
  }

  async close(): Promise<void> {
    if (this.pubClient) {
      await this.pubClient.quit();
    }
    if (this.subClient) {
      await this.subClient.quit();
    }
    this.logger.log('[RedisIoAdapter] Redis clients closed');
  }
}
