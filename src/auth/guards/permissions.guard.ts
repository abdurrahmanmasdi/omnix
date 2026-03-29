import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { I18nService } from 'nestjs-i18n';
import { PermissionsService } from '../services/permissions.service';
import { AppAction } from '../../constants/permissions.registry';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    created_at: Date;
  };
}

/**
 * Guard to enforce permission-based access control on routes
 *
 * Usage:
 * 1. Apply the guard globally:
 *    app.useGlobalGuards(PermissionsGuard)
 *
 * 2. Or apply to specific routes:
 *    @UseGuards(PermissionsGuard)
 *    @RequirePermissions(AppPermission.LEADS_READ, AppPermission.LEADS_EDIT)
 *    async myMethod() { ... }
 *
 * orgId Extraction Priority:
 * 1. request.params.orgId
 * 2. request.params.id (for single-resource endpoints)
 * 3. request.headers['x-organization-id']
 *
 * If no orgId found and permissions are required, throws BadRequestException.
 * If user lacks required permissions, throws ForbiddenException.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
    private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Step 1: Get required permissions from decorator metadata
    const requiredPermissions = this.reflector.get<string[]>(
      'permissions',
      context.getHandler(),
    );

    // If no permissions required, allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // Step 2: Extract user from request
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user || !user.id) {
      this.logger.warn(
        `[PermissionsGuard] No authenticated user found on request requiring permissions: [${requiredPermissions.join(', ')}]`,
      );
      throw new ForbiddenException(this.i18n.t('errors.UNAUTHORIZED_ACCESS'));
    }

    // Step 3: Extract organization ID from request
    const orgId = this.extractOrganizationId(request);

    if (!orgId) {
      this.logger.warn(
        `[PermissionsGuard] No organization ID found in request for user ${user.id} requiring permissions: [${requiredPermissions.join(', ')}]`,
      );
      throw new BadRequestException(
        this.i18n.t('errors.ORGANIZATION_ID_REQUIRED'),
      );
    }

    // Step 4: Get effective permissions for user in organization
    const effectivePermissions =
      await this.permissionsService.getEffectivePermissions(user.id, orgId);

    this.logger.debug(
      `[PermissionsGuard] User ${user.id} in org ${orgId} has permissions: [${effectivePermissions.join(', ')}]`,
    );

    // Step 5: Check if user has required permissions
    const hasRequiredPermissions = this.checkPermissions(
      effectivePermissions,
      requiredPermissions,
    );

    if (!hasRequiredPermissions) {
      this.logger.warn(
        `[PermissionsGuard] User ${user.id} lacks required permissions [${requiredPermissions.join(', ')}] in org ${orgId}`,
      );
      throw new ForbiddenException(
        this.i18n.t('errors.INSUFFICIENT_PERMISSIONS'),
      );
    }

    return true;
  }

  /**
   * Extract organization ID from request in priority order:
   * 1. request.params.orgId (standard naming)
   * 2. request.params.organizationId (alternative naming)
   * 3. request.params.id (single resource routes)
   * 4. request.headers['x-organization-id'] (header-based)
   *
   * @param request - Express request object
   * @returns Organization ID or null if not found
   */
  private extractOrganizationId(request: AuthenticatedRequest): string | null {
    const req = request as AuthenticatedRequest & Record<string, unknown>;

    // Priority 1: Direct orgId param
    const params = req.params as Record<string, string> | undefined;
    if (params?.orgId) {
      return params.orgId;
    }

    // Priority 2: Alternative organizationId param
    if (params?.organizationId) {
      return params.organizationId;
    }

    // Priority 3: ID param (for organization-scoped single resources)
    if (params?.id) {
      return params.id;
    }

    // Priority 4: Custom header
    const headerOrgId = req.headers?.['x-organization-id'];
    if (typeof headerOrgId === 'string') {
      return headerOrgId;
    }

    return null;
  }

  /**
   * Check if user has all required permissions
   *
   * Handles:
   * - Exact matches
   * - Wildcards: '*' grants all permissions
   * - Hierarchy implication rules:
   *   - resource:manage implies all actions for that resource
   *   - resource:read_all implies resource:read
   *   - resource:edit_all implies resource:edit
   *   - resource:delete_all implies resource:delete
   *
   * @param effectivePermissions - User's actual permissions
   * @param requiredPermissions - Permissions required for the route
   * @returns true if user has all required permissions, false otherwise
   */
  private checkPermissions(
    effectivePermissions: string[],
    requiredPermissions: string[],
  ): boolean {
    const granted = new Set(effectivePermissions);

    // Check if user has all required permissions after hierarchy expansion.
    return requiredPermissions.every((required) => {
      const candidates = this.getHierarchyCandidates(required);
      const matched = candidates.find((candidate) => granted.has(candidate));

      if (matched) {
        this.logger.debug(
          `[PermissionsGuard] Required ${required} granted via ${matched}`,
        );
        return true;
      }

      return false;
    });
  }

  private getHierarchyCandidates(requiredPermission: string): string[] {
    const [resource, action] = requiredPermission.split(':');

    if (!resource || !action) {
      return [requiredPermission, '*'];
    }

    const hierarchy = new Set<string>([
      requiredPermission,
      '*',
      `${resource}:*`,
      `${resource}:${AppAction.MANAGE}`,
    ]);

    if (action === AppAction.READ) {
      hierarchy.add(`${resource}:${AppAction.READ_ALL}`);
    }

    if (action === AppAction.EDIT) {
      hierarchy.add(`${resource}:${AppAction.EDIT_ALL}`);
    }

    if (action === AppAction.DELETE) {
      hierarchy.add(`${resource}:${AppAction.DELETE_ALL}`);
    }

    return [...hierarchy];
  }
}
