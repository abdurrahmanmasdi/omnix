import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PermissionService } from '../permission.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const organizationId = user?.organizationId;

    if (!user || !organizationId) {
      throw new ForbiddenException('Missing user or organization context for permissions check');
    }

    // Check if the user has AT LEAST ONE of the required permissions (OR logic),
    // or you can implement AND logic if required.
    // Assuming we want AND logic (must have all required permissions)
    for (const permission of requiredPermissions) {
      const hasPermission = await this.permissionService.has(user.id, organizationId, permission);
      if (!hasPermission) {
        throw new ForbiddenException(`Missing required permission: ${permission}`);
      }
    }

    return true;
  }
}
