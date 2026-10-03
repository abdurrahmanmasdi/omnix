import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';

const contextFor = (headers: Record<string, string>, method = 'POST') =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ method, headers }) }),
  }) as unknown as ExecutionContext;

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('allows an allowed Origin and a request without Origin/Referer', () => {
    expect(
      guard.canActivate(contextFor({ origin: 'http://localhost:3001' })),
    ).toBe(true);
    expect(guard.canActivate(contextFor({}))).toBe(true);
  });

  it('rejects a foreign Origin or Referer with 403', () => {
    expect(() =>
      guard.canActivate(contextFor({ origin: 'https://evil.example' })),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(contextFor({ referer: 'https://evil.example/page' })),
    ).toThrow(ForbiddenException);
  });

  it('rejects a malformed Referer with 403 instead of a 500', () => {
    expect(() =>
      guard.canActivate(contextFor({ referer: 'not a url' })),
    ).toThrow(ForbiddenException);
  });
});
