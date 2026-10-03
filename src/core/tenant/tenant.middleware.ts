import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { tenantStorage } from './tenant.context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // The webhook controller verifies Meta's signature before it queues work.
    // Auth endpoints that accept invitations discover their own tenant.
    if (
      req.path.startsWith('/webhooks/whatsapp') ||
      req.path.startsWith('/auth/accept-invitation') ||
      req.path.startsWith('/auth/invitations/clinic/accept') ||
      req.path.startsWith('/auth/recovery/consume')
    ) {
      return tenantStorage.run({ isSystemBypass: true }, () => next());
    }

    // Establish the async context before Nest enters its guards. The JWT
    // strategy subsequently checks the active user and membership in the DB.
    // A malformed or unsigned header must never set a tenant here.
    let organizationId: string | undefined;
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    const secret = this.config.get<string>('JWT_ACCESS_SECRET');
    if (token && secret) {
      try {
        const payload = new JwtService().verify<{ organizationId?: unknown }>(
          token,
          { secret },
        );
        if (typeof payload.organizationId === 'string')
          organizationId = payload.organizationId;
      } catch {
        // The route's auth guard returns the appropriate 401 response.
      }
    }
    tenantStorage.run({ organizationId, isSystemBypass: false }, () => {
      next();
    });
  }
}
