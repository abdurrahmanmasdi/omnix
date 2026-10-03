import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import * as crypto from 'crypto';

type TrackedRequest = {
  ip?: string;
  connection?: { remoteAddress?: string };
  body?: { email?: unknown; token?: unknown };
};

/** SHA-256 of the client IP, so raw IPs are never stored in Redis. */
export function hashedIp(req: TrackedRequest): string {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex');
}

/**
 * Named throttlers used with CustomThrottlerGuard (limits are per route handler):
 * - auth:    per IP + email/token, strict (credential guessing on one account)
 * - loginIp: per IP across all emails, login only (password spraying)
 * - session: per IP, generous, for refresh/me/logout (many staff behind one clinic NAT)
 * Controllers skip the throttlers that don't apply to them with @SkipThrottle.
 */
export const THROTTLERS = {
  auth: { ttl: 300_000, limit: 10 },
  loginIp: { ttl: 300_000, limit: 30 },
  session: { ttl: 60_000, limit: 120 },
} as const;

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: TrackedRequest): Promise<string> {
    const ip = hashedIp(req);

    // Combine with the account email or identifier if available in the body for sensitive routes
    let identifier = '';
    if (req.body) {
      if (typeof req.body.email === 'string') {
        identifier = crypto
          .createHash('sha256')
          .update(req.body.email.toLowerCase().trim())
          .digest('hex');
      } else if (typeof req.body.token === 'string') {
        identifier = crypto
          .createHash('sha256')
          .update(req.body.token)
          .digest('hex');
      }
    }

    return identifier ? `${ip}:${identifier}` : ip;
  }

  protected async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException('Too many requests. Please try again later.');
  }
}
