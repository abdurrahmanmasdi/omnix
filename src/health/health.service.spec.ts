import { ConfigService } from '@nestjs/config';
import { GrpcClientService } from '../grpc-client/grpc-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

const grpcClient = (error: Error | null) =>
  ({
    ping: jest.fn(() => (error ? Promise.reject(error) : Promise.resolve())),
  }) as unknown as GrpcClientService;

describe('HealthService.readiness (KI-033)', () => {
  const service = (dbOk: boolean, redisOk: boolean, grpcOk: boolean) => {
    const prisma = {
      $queryRaw: jest.fn(() =>
        dbOk
          ? Promise.resolve([{ '?column?': 1 }])
          : Promise.reject(new Error('db down: secret-host')),
      ),
    } as unknown as PrismaService;
    const health = new HealthService(
      prisma,
      { get: jest.fn() } as unknown as ConfigService,
      grpcClient(grpcOk ? null : new Error('unavailable')),
    );
    jest
      .spyOn(health as unknown as { ping: () => Promise<void> }, 'ping')
      .mockImplementation(() =>
        redisOk ? Promise.resolve() : Promise.reject(new Error('nope')),
      );
    return health;
  };

  it('is ready when every dependency answers', async () => {
    await expect(service(true, true, true).readiness()).resolves.toEqual({
      ready: true,
      checks: { database: 'ok', redis: 'ok', grpc: 'ok' },
    });
  });

  it('names the failing dependency without error details', async () => {
    const result = await service(false, true, false).readiness();
    expect(result).toEqual({
      ready: false,
      checks: { database: 'failed', redis: 'ok', grpc: 'failed' },
    });
    expect(JSON.stringify(result)).not.toContain('secret-host');
  });
});
