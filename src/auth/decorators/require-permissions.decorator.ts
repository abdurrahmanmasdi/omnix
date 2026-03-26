import { SetMetadata } from '@nestjs/common';
import { PermissionString } from '../../constants/permissions.registry';

/**
 * Decorator for protecting routes with required permissions
 *
 * STRICT TYPE-SAFE ENFORCEMENT: Only accepts PermissionString types from the registry.
 * This prevents magic strings and typos in permission checks.
 *
 * Usage:
 * @RequirePermissions(AppPermission.TEAM_MEMBERS_MANAGE)
 * @RequirePermissions(AppPermission.LEADS_READ, AppPermission.LEADS_EDIT)
 * async myMethod() { ... }
 *
 * This decorator marks routes that require specific permissions.
 * The PermissionsGuard will extract these metadata and validate them.
 *
 * @param permissions - Array of required permission strings from AppPermission registry
 */
export const RequirePermissions = (...permissions: PermissionString[]) =>
  SetMetadata('permissions', permissions);
