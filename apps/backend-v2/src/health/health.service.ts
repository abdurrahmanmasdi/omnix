import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { tenantStorage } from '../core/tenant/tenant.context';
import { GrpcClientService } from '../grpc-client/grpc-client.service';

export type CheckName = 'database' | 'redis' | 'grpc';
export interface Readiness {
  ready: boolean;
  checks: Record<CheckName, 'ok' | 'failed'>;
}

const CHECK_TIMEOUT_MS = 2_000;

const withTimeout = <T>(work: Promise<T>): Promise<T> =>
  Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS).unref(),
    ),
  ]);

/** Readiness of the API's hard dependencies (KI-033). Reports names only, never errors. */
@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  private redis: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly grpcClient: GrpcClientService,
  ) {}

  async readiness(): Promise<Readiness> {
    const entries = await Promise.all(
      (
        [
          ['database', () => this.database()],
          ['redis', () => this.ping()],
          ['grpc', () => this.grpc()],
        ] as const
      ).map(async ([name, check]) => {
        try {
          await withTimeout(check());
          return [name, 'ok'] as const;
        } catch {
          this.logger.warn(`READINESS_CHECK_FAILED check=${name}`);
          return [name, 'failed'] as const;
        }
      }),
    );
    const checks = Object.fromEntries(entries) as Readiness['checks'];
    return {
      ready: Object.values(checks).every((state) => state === 'ok'),
      checks,
    };
  }

  private database() {
    // Raw SQL is only allowed in system scope (Prisma tenant guard).
    return tenantStorage.run(
      { isSystemBypass: true },
      () => this.prisma.$queryRaw`SELECT 1`,
    );
  }

  private async ping() {
    this.redis ??= new Redis(this.config.get<string>('REDIS_URL') ?? '', {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    if (this.redis.status === 'wait' || this.redis.status === 'end') {
      await this.redis.connect();
    }
    await this.redis.ping();
  }

  // An authenticated call, not just a connection: a wrong INTERNAL_RPC_SECRET
  // must make the API not ready (KI-083).
  private grpc() {
    return this.grpcClient.ping(CHECK_TIMEOUT_MS);
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }
}
