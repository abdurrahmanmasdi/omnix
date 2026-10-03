import {
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsAccessGuard } from './metrics-access.guard';

const guardFor = (values: Record<string, string>) =>
  new MetricsAccessGuard({
    get: (key: string) => values[key],
  } as unknown as ConfigService);
const contextWith = (authorization?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: authorization ? { authorization } : {} }),
    }),
  }) as unknown as ExecutionContext;

describe('MetricsAccessGuard (KI-033)', () => {
  it('is open outside production', () => {
    expect(
      guardFor({ NODE_ENV: 'development' }).canActivate(contextWith()),
    ).toBe(true);
  });

  it('disables /metrics in production without a METRICS_TOKEN', () => {
    expect(() =>
      guardFor({ NODE_ENV: 'production' }).canActivate(contextWith()),
    ).toThrow(NotFoundException);
  });

  it('requires the bearer token in production', () => {
    const guard = guardFor({
      NODE_ENV: 'production',
      METRICS_TOKEN: 'synthetic-metrics-token',
    });
    expect(() => guard.canActivate(contextWith())).toThrow(
      UnauthorizedException,
    );
    expect(() => guard.canActivate(contextWith('Bearer wrong'))).toThrow(
      UnauthorizedException,
    );
    expect(
      guard.canActivate(contextWith('Bearer synthetic-metrics-token')),
    ).toBe(true);
  });
});
