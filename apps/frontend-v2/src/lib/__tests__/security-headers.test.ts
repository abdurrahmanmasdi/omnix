// @vitest-environment node
import { describe, expect, it } from 'vitest';
import config from '../../../next.config';

describe('dashboard security headers', () => {
  it('protects every route and keeps the candidate CSP report-only until QA-1', async () => {
    const routes = await config.headers?.();
    const route = routes?.find((route) => route.source === '/:path*');
    const headers = Object.fromEntries(route?.headers.map(({ key, value }) => [key, value]) ?? []);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(headers['Content-Security-Policy-Report-Only']).toContain("frame-ancestors 'none'");
    expect(headers['Content-Security-Policy-Report-Only']).toContain("object-src 'none'");
    expect(headers['Content-Security-Policy']).toBeUndefined();
  });
});
