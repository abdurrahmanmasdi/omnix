import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AccessControlService } from './access-control.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import {
  CreateRoleDto,
  AttachPermissionsToRoleDto,
  UpdateMemberRoleDto,
  CreatePermissionOverrideDto,
} from './dtos';

interface TenantRequest extends Request {
  user?: { id: string };
  tenantId?: string;
}

@ApiTags('access-control')
@Controller('access')
@ApiBearerAuth()
export class AccessControlController {
  constructor(private readonly accessControlService: AccessControlService) {}

  /**
   * Create a new custom role for the current organization
   */
  @Post('roles')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('roles:write')
  @ApiOperation({ summary: 'Create a new role' })
  @ApiResponse({
    status: 201,
    description: 'Role created successfully',
    schema: {
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        organization_id: { type: 'string', format: 'uuid' },
        created_at: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Role already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permissions' })
  async createRole(
    @Request() req: TenantRequest,
    @Body() createRoleDto: CreateRoleDto,
  ) {
    return this.accessControlService.createRole(req.tenantId!, createRoleDto);
  }

  /**
   * Attach permissions to a role
   */
  @Post('roles/:roleId/permissions')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('roles:write')
  @ApiOperation({ summary: 'Attach permissions to a role' })
  @ApiResponse({
    status: 201,
    description: 'Permissions attached successfully',
    schema: {
      properties: {
        message: { type: 'string' },
        role_id: { type: 'string', format: 'uuid' },
        permissions_attached: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permissions' })
  async attachPermissionsToRole(
    @Request() req: TenantRequest,
    @Param('roleId') roleId: string,
    @Body() attachPermissionsDto: AttachPermissionsToRoleDto,
  ) {
    return this.accessControlService.attachPermissionsToRole(
      req.tenantId!,
      roleId,
      attachPermissionsDto,
    );
  }

  /**
   * Update a member's role
   */
  @Put('members/:membershipId/role')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('members:write')
  @ApiOperation({ summary: "Update a member's role" })
  @ApiResponse({
    status: 200,
    description: 'Member role updated successfully',
    schema: {
      properties: {
        message: { type: 'string' },
        membership_id: { type: 'string', format: 'uuid' },
        user_email: { type: 'string' },
        new_role: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Membership or role not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permissions' })
  async updateMemberRole(
    @Request() req: TenantRequest,
    @Param('membershipId') membershipId: string,
    @Body() updateMemberRoleDto: UpdateMemberRoleDto,
  ) {
    return this.accessControlService.updateMemberRole(
      req.tenantId!,
      membershipId,
      updateMemberRoleDto,
    );
  }

  /**
   * Create or update a permission override for a member
   * Allows granting extra permissions or revoking default role permissions
   */
  @Post('members/:membershipId/overrides')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('members:write')
  @ApiOperation({
    summary: 'Create or update a permission override',
    description:
      'Grant or revoke a specific permission for a member, overriding their role permissions',
  })
  @ApiResponse({
    status: 201,
    description: 'Permission override created/updated successfully',
    schema: {
      properties: {
        message: { type: 'string' },
        membership_id: { type: 'string', format: 'uuid' },
        permission_name: { type: 'string' },
        is_granted: { type: 'boolean' },
        cache_invalidated: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({
    status: 404,
    description: 'Membership or permission not found',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permissions' })
  async createPermissionOverride(
    @Request() req: TenantRequest,
    @Param('membershipId') membershipId: string,
    @Body() createOverrideDto: CreatePermissionOverrideDto,
  ) {
    return this.accessControlService.createOrUpdatePermissionOverride(
      req.tenantId!,
      membershipId,
      createOverrideDto,
    );
  }

  /**
   * Get all system permissions
   * Used by frontend to render permission checkboxes
   */
  @Get('permissions')
  @RequirePermissions('roles:read')
  @ApiOperation({ summary: 'Get all system permissions' })
  @ApiResponse({
    status: 200,
    description: 'List of all system permissions',
    schema: {
      type: 'array',
      items: {
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permissions' })
  async getSystemPermissions() {
    return this.accessControlService.getSystemPermissions();
  }

  /**
   * Get all roles for the current organization
   * Returns both global system roles and tenant-specific custom roles
   */
  @Get('roles')
  @RequirePermissions('roles:read')
  @ApiOperation({
    summary: 'Get all roles for the organization',
    description:
      'Returns both global system roles and organization-specific custom roles',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all available roles',
    schema: {
      type: 'array',
      items: {
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          organization_id: { type: 'string', format: 'uuid', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permissions' })
  async getRoles(@Request() req: TenantRequest) {
    return this.accessControlService.getRoles(req.tenantId!);
  }

  /**
   * Get a specific role with all attached permissions
   */
  @Get('roles/:roleId')
  @RequirePermissions('roles:read')
  @ApiOperation({
    summary: 'Get a specific role with its permissions',
  })
  @ApiResponse({
    status: 200,
    description: 'Role details with attached permissions',
    schema: {
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        organization_id: { type: 'string', format: 'uuid', nullable: true },
        created_at: { type: 'string', format: 'date-time' },
        permissions: {
          type: 'array',
          items: {
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Role not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permissions' })
  async getRole(
    @Request() req: TenantRequest,
    @Param('roleId') roleId: string,
  ) {
    return this.accessControlService.getRole(req.tenantId!, roleId);
  }

  /**
   * Get all members (active) in the current organization
   * Includes user profile and role information
   */
  @Get('members')
  @RequirePermissions('members:read')
  @ApiOperation({
    summary: 'Get all members in the organization',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all active members',
    schema: {
      type: 'array',
      items: {
        properties: {
          id: { type: 'string', format: 'uuid' },
          user_id: { type: 'string', format: 'uuid' },
          organization_id: { type: 'string', format: 'uuid' },
          role_id: { type: 'string', format: 'uuid' },
          status: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
          user: {
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string' },
              first_name: { type: 'string' },
              last_name: { type: 'string' },
            },
          },
          role: {
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permissions' })
  async getMembers(@Request() req: TenantRequest) {
    return this.accessControlService.getMembers(req.tenantId!);
  }

  /**
   * Get a specific member with their role and permission overrides
   * Includes both role permissions and custom overrides for UI display
   */
  @Get('members/:membershipId')
  @RequirePermissions('members:read')
  @ApiOperation({
    summary: 'Get a specific member with their permissions',
  })
  @ApiResponse({
    status: 200,
    description: 'Member details with role and permission overrides',
    schema: {
      properties: {
        id: { type: 'string', format: 'uuid' },
        user_id: { type: 'string', format: 'uuid' },
        organization_id: { type: 'string', format: 'uuid' },
        role_id: { type: 'string', format: 'uuid' },
        status: { type: 'string' },
        created_at: { type: 'string', format: 'date-time' },
        user: {
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        role: {
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            permissions: {
              type: 'array',
              items: {
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
        permissionOverrides: {
          type: 'array',
          items: {
            properties: {
              id: { type: 'string', format: 'uuid' },
              permission_id: { type: 'string', format: 'uuid' },
              is_granted: { type: 'boolean' },
              permission: {
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Member not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permissions' })
  getMember(
    @Request() req: TenantRequest,
    @Param('membershipId') membershipId: string,
  ) {
    return this.accessControlService.getMember(req.tenantId!, membershipId);
  }
}
