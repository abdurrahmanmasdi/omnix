import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * /metrics is open in development/test. In production it needs
 * `Authorization: Bearer <METRICS_TOKEN>`; without a METRICS_TOKEN it is disabled (404).
 * (KI-033: it was public.)
 */
@Injectable()
export class MetricsAccessGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.get<string>('NODE_ENV') !== 'production') return true;
    const token = this.config.get<string>('METRICS_TOKEN');
    if (!token) throw new NotFoundException();
    const header =
      context.switchToHttp().getRequest<Request>().headers.authorization ?? '';
    const presented = Buffer.from(header.replace(/^Bearer /, ''));
    const expected = Buffer.from(token);
    if (
      presented.length !== expected.length ||
      !timingSafeEqual(presented, expected)
    ) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
