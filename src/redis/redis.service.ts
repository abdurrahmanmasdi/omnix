import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType | null = null;
  private isAvailable = false;
  private readonly logger = new Logger(RedisService.name);

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );

    try {
      this.client = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: () => false, // Disable auto-reconnect to fail fast
          connectTimeout: 5000, // 5 second timeout
        },
      }) as RedisClientType;

      this.client.on('error', (error) => {
        this.logger.debug(`[RedisService] Connection error: ${error}`);
        this.isAvailable = false;
      });

      this.client.on('connect', () => {
        this.logger.log('[RedisService] Connected to Redis');
        this.isAvailable = true;
      });

      await this.client.connect();
    } catch (error) {
      this.logger.warn(
        `[RedisService] Redis unavailable: ${error}. Continuing with database fallback.`,
      );
      this.isAvailable = false;
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
        this.logger.log('[RedisService] Disconnected from Redis');
      } catch (error) {
        this.logger.debug(`[RedisService] Error disconnecting: ${error}`);
      }
    }
  }

  /**
   * Get value from Redis
   * Returns null if Redis is unavailable (graceful fallback)
   */
  async get(key: string): Promise<string | null> {
    if (!this.isAvailable || !this.client) {
      return null;
    }

    try {
      return await this.client.get(key);
    } catch (error) {
      this.logger.debug(
        `[RedisService] Get operation failed for key ${key}: ${error}`,
      );
      this.isAvailable = false;
      return null;
    }
  }

  /**
   * Set value in Redis with optional TTL (in seconds)
   * Silently fails if Redis is unavailable (graceful fallback)
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isAvailable || !this.client) {
      return;
    }

    try {
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      this.logger.debug(
        `[RedisService] Set operation failed for key ${key}: ${error}`,
      );
      this.isAvailable = false;
    }
  }

  /**
   * Delete key from Redis
   * Silently fails if Redis is unavailable (graceful fallback)
   */
  async del(key: string): Promise<number> {
    if (!this.isAvailable || !this.client) {
      return 0;
    }

    try {
      return await this.client.del(key);
    } catch (error) {
      this.logger.debug(
        `[RedisService] Delete operation failed for key ${key}: ${error}`,
      );
      this.isAvailable = false;
      return 0;
    }
  }

  /**
   * Delete multiple keys from Redis in a single operation.
   */
  async delMany(keys: string[]): Promise<number> {
    if (!this.isAvailable || !this.client || keys.length === 0) {
      return 0;
    }

    try {
      return await this.client.del(keys);
    } catch (error) {
      this.logger.debug(
        `[RedisService] Multi-delete operation failed for ${keys.length} keys: ${error}`,
      );
      this.isAvailable = false;
      return 0;
    }
  }

  /**
   * Add members to a Redis set.
   */
  async sAdd(key: string, members: string[]): Promise<number> {
    if (!this.isAvailable || !this.client || members.length === 0) {
      return 0;
    }

    try {
      return await this.client.sAdd(key, members);
    } catch (error) {
      this.logger.debug(
        `[RedisService] sAdd operation failed for key ${key}: ${error}`,
      );
      this.isAvailable = false;
      return 0;
    }
  }

  /**
   * Read all members from a Redis set.
   */
  async sMembers(key: string): Promise<string[]> {
    if (!this.isAvailable || !this.client) {
      return [];
    }

    try {
      return await this.client.sMembers(key);
    } catch (error) {
      this.logger.debug(
        `[RedisService] sMembers operation failed for key ${key}: ${error}`,
      );
      this.isAvailable = false;
      return [];
    }
  }

  /**
   * Remove members from a Redis set.
   */
  async sRem(key: string, members: string[]): Promise<number> {
    if (!this.isAvailable || !this.client || members.length === 0) {
      return 0;
    }

    try {
      return await this.client.sRem(key, members);
    } catch (error) {
      this.logger.debug(
        `[RedisService] sRem operation failed for key ${key}: ${error}`,
      );
      this.isAvailable = false;
      return 0;
    }
  }

  /**
   * Set/refresh expiry for a Redis key.
   */
  async expire(key: string, ttlSeconds: number): Promise<number> {
    if (!this.isAvailable || !this.client) {
      return 0;
    }

    try {
      return await this.client.expire(key, ttlSeconds);
    } catch (error) {
      this.logger.debug(
        `[RedisService] Expire operation failed for key ${key}: ${error}`,
      );
      this.isAvailable = false;
      return 0;
    }
  }

  /**
   * Delete keys using SCAN to avoid blocking Redis.
   */
  async deleteByPattern(
    pattern: string,
    scanCount: number = 200,
  ): Promise<number> {
    if (!this.isAvailable || !this.client) {
      return 0;
    }

    let cursor = '0';
    let deletedCount = 0;

    try {
      do {
        const reply = await this.client.scan(cursor, {
          MATCH: pattern,
          COUNT: scanCount,
        });

        cursor = reply.cursor;

        if (reply.keys.length > 0) {
          deletedCount += await this.delMany(reply.keys);
        }
      } while (cursor !== '0');

      return deletedCount;
    } catch (error) {
      this.logger.debug(
        `[RedisService] deleteByPattern failed for pattern ${pattern}: ${error}`,
      );
      this.isAvailable = false;
      return deletedCount;
    }
  }

  /**
   * Check if Redis is connected and available
   */
  isConnected(): boolean {
    return (this.isAvailable && this.client?.isReady) ?? false;
  }
}
