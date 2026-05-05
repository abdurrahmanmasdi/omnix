import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { tenantStorage } from './tenant.context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // 1. Webhook bypass: Webhooks run as "System"
    if (req.path.includes('/webhooks')) {
      return tenantStorage.run({ isSystemBypass: true }, () => next());
    }

    let organizationId: string | undefined = undefined;

    // 2. Extract the JWT from the header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];

      try {
        // Lightning-fast decode of the JWT payload (the middle section of the token)
        const payloadStr = Buffer.from(
          token.split('.')[1],
          'base64',
        ).toString();
        const payload = JSON.parse(payloadStr);

        if (payload && payload.organizationId) {
          organizationId = payload.organizationId;
        }
      } catch (e) {
        // We ignore decode errors here. The JwtAuthGuard will catch bad tokens and block the request.
      }
    }

    // 3. Run the entire HTTP request inside the Tenant Context "Backpack"!
    tenantStorage.run({ organizationId, isSystemBypass: false }, () => {
      next();
    });
  }
}
