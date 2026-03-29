import { MembershipStatus } from '@prisma/client';
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

// Extend Express Request to include our custom properties
interface TenantRequest extends Request {
  user?: { id: string };
  tenantId?: string;
}

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<TenantRequest>();

    // Extract organization ID from custom header
    const organizationId = request.headers['x-organization-id'] as
      | string
      | undefined;

    // If no organization header is provided, allow the request to pass through
    // (useful for endpoints that don't require tenant context)
    if (!organizationId) {
      return next.handle();
    }

    // Extract user ID from request (set by JWT AuthGuard)
    const userId = request.user?.id;

    if (!userId) {
      this.logger.warn('TenantInterceptor: User ID not found in request');
      throw new UnauthorizedException(
        this.i18n.t('organizations.ERRORS.TENANT.USER_INFO_MISSING'),
      );
    }

    try {
      // Query database to verify user has ACTIVE membership to this organization
      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          user_id: userId,
          organization_id: organizationId,
          status: MembershipStatus.ACTIVE,
        },
      });

      if (!membership) {
        this.logger.warn(
          `TenantInterceptor: User ${userId} does not have active membership to organization ${organizationId}`,
        );
        throw new UnauthorizedException(
          this.i18n.t('organizations.ERRORS.TENANT.NO_ORG_ACCESS'),
        );
      }

      // Inject verified organization ID into request object
      request.tenantId = organizationId;

      this.logger.debug(
        `TenantInterceptor: User ${userId} verified for organization ${organizationId}`,
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error(
        `TenantInterceptor: Error verifying organization membership: ${error}`,
      );
      throw new UnauthorizedException(
        this.i18n.t('organizations.ERRORS.TENANT.VERIFY_FAILED'),
      );
    }

    return next.handle();
  }
}
