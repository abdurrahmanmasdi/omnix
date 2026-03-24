import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PermissionsService } from '../services/permissions.service';

// Extend Express Request to include custom properties from TenantInterceptor and JWT Guard
interface TenantAuthRequest extends Request {
  user?: { id: string };
  tenantId?: string;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Step 1: Read required permissions from decorator
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permissions required, allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // Step 2: Extract user ID and tenant ID from request
    const request = context.switchToHttp().getRequest<TenantAuthRequest>();
    const userId = request.user?.id;
    const tenantId = request.tenantId;

    // Step 3: Error Handling Requirement 1 - Check for missing tenantId or userId
    if (!userId || !tenantId) {
      this.logger.error(
        `[PermissionsGuard] CRITICAL: Request missing required context. userId: ${userId}, tenantId: ${tenantId}. Request likely bypassed TenantInterceptor.`,
      );
      throw new UnauthorizedException(
        'Request context incomplete. Please try again.',
      );
    }

    try {
      // Step 3: Permission Resolution - Get user's calculated permissions
      // (with Redis caching and automatic fallback to database)
      const userPermissions = await this.permissionsService.getUserPermissions(
        userId,
        tenantId,
      );

      // Step 4: The Evaluation - Check if user has ALL required permissions
      const missingPermissions = requiredPermissions.filter(
        (required) => !userPermissions.includes(required),
      );

      if (missingPermissions.length > 0) {
        // Error Handling Requirement 4: Log detailed internal warning
        this.logger.warn(
          `[PermissionsGuard] User ${userId} in Tenant ${tenantId} denied access. Missing permissions: [${missingPermissions.join(', ')}]`,
        );

        // Error Handling Requirement 3: Throw generic ForbiddenException for client
        throw new ForbiddenException(
          'You do not have permission to perform this action.',
        );
      }

      // User has all required permissions - allow access
      this.logger.debug(
        `[PermissionsGuard] User ${userId} granted access to tenant ${tenantId}. Required permissions: [${requiredPermissions.join(', ')}]`,
      );
      return true;
    } catch (error) {
      // Re-throw NestJS exceptions (UnauthorizedException, ForbiddenException)
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      // Log unexpected errors but convert to ForbiddenException for safety
      this.logger.error(
        `[PermissionsGuard] Unexpected error checking permissions for user ${userId} in tenant ${tenantId}: ${error}`,
      );
      throw new ForbiddenException(
        'Unable to verify permissions. Please try again later.',
      );
    }
  }
}
