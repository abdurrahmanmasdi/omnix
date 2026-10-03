import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { parseFrontendOrigins } from '../../config/frontend-origins';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // We only care about state-changing methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return true;
    }

    const origin = request.headers.origin;

    // If no origin is provided and the client is a browser, they are doing a simple form post.
    // In our modern SPA, all requests should be XHR/fetch and have an Origin header.
    // If Origin is missing, we could reject it, but let's just allow if there's no Origin?
    // Wait, if an attacker uses a form POST, the browser will send an Origin header.
    // If they spoof it outside a browser, they don't have our cookies anyway, so CSRF isn't an issue.
    // So we just need to ensure the Origin (if present) is allowed.

    const allowedOrigins = parseFrontendOrigins();

    if (origin && !allowedOrigins.includes(origin)) {
      throw new ForbiddenException('CSRF/Origin check failed');
    }

    // For extra safety on older browsers, check Referer if Origin is missing
    if (!origin && request.headers.referer) {
      let referer: string | null = null;
      try {
        referer = new URL(request.headers.referer).origin;
      } catch {
        // A malformed Referer is treated like a foreign one (403), never a 500.
      }
      if (!referer || !allowedOrigins.includes(referer)) {
        throw new ForbiddenException('CSRF/Referer check failed');
      }
    }

    // If both are missing, it's a programmatic client (like curl).
    // Programmatic clients don't have cookies unless they explicitly send them, so CSRF via browser is not applicable.
    // But to be completely safe, we could require Origin for cookie-authenticated routes.
    // Actually, just checking if origin/referer is not in our list is enough for browser CSRF protection.

    return true;
  }
}
