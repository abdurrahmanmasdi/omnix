import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSIONS_KEY = 'require_permissions';

/**
 * Decorator to specify required permissions for a route
 * @param permissions Array of permission strings (e.g., 'deals:read', 'deals:write')
 *
 * @example
 * @RequirePermissions('deals:read', 'deals:write')
 * async getDeal(@Param('id') id: string) { ... }
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
