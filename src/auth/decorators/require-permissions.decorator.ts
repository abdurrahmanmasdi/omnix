import { SetMetadata } from '@nestjs/common';

/**
 * Decorator for protecting routes with required permissions
 *
 * Usage:
 * @RequirePermissions('READ', 'WRITE')
 * async myMethod() { ... }
 *
 * This decorator marks routes that require specific permissions.
 * The PermissionsGuard will extract these metadata and validate them.
 *
 * @param permissions - Array of required permission actions (e.g., 'READ', 'WRITE', 'DELETE')
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata('permissions', permissions);
