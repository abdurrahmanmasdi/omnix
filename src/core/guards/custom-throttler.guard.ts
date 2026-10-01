import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import * as crypto from 'crypto';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: { ip?: string; connection?: { remoteAddress?: string }; body?: { email?: unknown; token?: unknown } }): Promise<string> {
    // Generate a secure hash of the IP to avoid storing raw IPs in Redis
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const hashedIp = crypto.createHash('sha256').update(ip).digest('hex');

    // Combine with the account email or identifier if available in the body for sensitive routes
    let identifier = '';
    if (req.body) {
      if (typeof req.body.email === 'string') {
        identifier = crypto.createHash('sha256').update(req.body.email.toLowerCase().trim()).digest('hex');
      } else if (typeof req.body.token === 'string') {
        identifier = crypto.createHash('sha256').update(req.body.token).digest('hex');
      }
    }

    return identifier ? `${hashedIp}:${identifier}` : hashedIp;
  }

  protected async throwThrottlingException(
  ): Promise<void> {
    throw new ThrottlerException('Too many requests. Please try again later.');
  }
}
