import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AccessControlService,
  RoleWithPermissions,
} from './access-control.service';
import { CreateRoleDto } from './dtos/create-role.dto';
import { UpdateRoleDto } from './dtos/update-role.dto';
import { UpdateMemberRoleDto } from './dtos/update-member-role.dto';
import { CreatePermissionOverrideDto } from './dtos/create-permission-override.dto';

interface AuthRequest extends ExpressRequest {
  user: { id: string };
}

@ApiTags('roles')
@Controller('organizations/:orgId/roles')
@ApiBearerAuth()
export class AccessControlController {
  constructor(private readonly accessControlService: AccessControlService) {}

  /**
   * Get all roles for an organization with their associated permissions
   * Secured: User must have ACTIVE membership in the organization
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get all roles for an organization',
    description:
      'Retrieves all roles with their associated permissions for the specified organization',
  })
  @ApiParam({
    name: 'orgId',
    description: 'The organization ID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Roles retrieved successfully',
    schema: {
      type: 'array',
      items: {
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          organization_id: { type: 'string', format: 'uuid' },
          created_at: { type: 'string', format: 'date-time' },
          rolePermissions: {
            type: 'array',
            items: {
              properties: {
                permission: {
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    action: { type: 'string' },
                    description: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'User is not authorized for this organization',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getRoles(
    @Param('orgId') organizationId: string,
    @Request() req: AuthRequest,
  ): Promise<RoleWithPermissions[]> {
    return this.accessControlService.getRoles(organizationId, req.user.id);
  }

  /**
   * Create a new role for the organization with permissions
   * Wrapped in a transaction to ensure consistency
   * Secured: User must have ACTIVE membership in the organization
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new role for an organization',
    description:
      'Creates a new role and associates it with the provided permissions. Operation is transactional.',
  })
  @ApiParam({
    name: 'orgId',
    description: 'The organization ID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 201,
    description: 'Role created successfully',
    schema: {
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        organization_id: { type: 'string', format: 'uuid' },
        created_at: { type: 'string', format: 'date-time' },
        rolePermissions: {
          type: 'array',
          items: {
            properties: {
              permission: {
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  action: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or invalid permissions',
  })
  @ApiResponse({
    status: 403,
    description: 'User is not authorized for this organization',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createRole(
    @Param('orgId') organizationId: string,
    @Request() req: AuthRequest,
    @Body() createRoleDto: CreateRoleDto,
  ): Promise<RoleWithPermissions> {
    return this.accessControlService.createRole(
      organizationId,
      req.user.id,
      createRoleDto,
    );
  }

  /**
   * Update a specific role's name and/or permissions
   * Wrapped in a transaction to ensure consistency
   * Secured: User must have ACTIVE membership in the organization
   */
  @Patch(':roleId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update a role',
    description:
      "Updates a role's name and/or permissions. Updating permissions deletes old associations and creates new ones. Operation is transactional.",
  })
  @ApiParam({
    name: 'orgId',
    description: 'The organization ID',
    format: 'uuid',
  })
  @ApiParam({
    name: 'roleId',
    description: 'The role ID to update',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Role updated successfully',
    schema: {
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        organization_id: { type: 'string', format: 'uuid' },
        created_at: { type: 'string', format: 'date-time' },
        rolePermissions: {
          type: 'array',
          items: {
            properties: {
              permission: {
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  action: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or invalid permissions',
  })
  @ApiResponse({ status: 404, description: 'Role not found' })
  @ApiResponse({
    status: 403,
    description: 'User is not authorized for this organization',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateRole(
    @Param('orgId') organizationId: string,
    @Param('roleId') roleId: string,
    @Request() req: AuthRequest,
    @Body() updateRoleDto: UpdateRoleDto,
  ): Promise<RoleWithPermissions> {
    return this.accessControlService.updateRole(
      organizationId,
      roleId,
      req.user.id,
      updateRoleDto,
    );
  }

  /**
   * Delete a role from the organization
   * Validations:
   * - Role name must not be 'Owner' or 'Admin' (protected roles)
   * - Role must not have any active organization members
   * Secured: User must have ACTIVE membership in the organization
   */
  @Delete(':roleId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a role from an organization',
    description:
      'Deletes a role. Cannot delete "Owner" or "Admin" protected roles, or roles with active members.',
  })
  @ApiParam({
    name: 'orgId',
    description: 'The organization ID',
    format: 'uuid',
  })
  @ApiParam({
    name: 'roleId',
    description: 'The role ID to delete',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Role deleted successfully',
    schema: {
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete protected role or role with active members',
  })
  @ApiResponse({ status: 404, description: 'Role not found' })
  @ApiResponse({
    status: 403,
    description: 'User is not authorized for this organization',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteRole(
    @Param('orgId') organizationId: string,
    @Param('roleId') roleId: string,
    @Request() req: AuthRequest,
  ): Promise<{ message: string }> {
    return this.accessControlService.deleteRole(
      organizationId,
      roleId,
      req.user.id,
    );
  }

  /**
   * Change a member's role within an organization
   * Security: Only the organization Owner can perform this action
   * Restriction: Cannot change the role of a member who has the Owner role
   * Secured: User must be the Owner of the organization
   */
  @Patch('memberships/:membershipId/role')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Change a member's role",
    description:
      "Allows the organization Owner to change another member's role. Cannot change the role of the Owner.",
  })
  @ApiParam({
    name: 'orgId',
    description: 'The organization ID',
    format: 'uuid',
  })
  @ApiParam({
    name: 'membershipId',
    description: 'The membership ID to update',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Member role changed successfully',
    schema: {
      properties: {
        id: { type: 'string', format: 'uuid' },
        role_id: { type: 'string', format: 'uuid' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot modify Owner role or invalid role',
  })
  @ApiResponse({ status: 404, description: 'Membership or role not found' })
  @ApiResponse({
    status: 403,
    description: 'Only the organization Owner can perform this action',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async changeMemberRole(
    @Param('orgId') organizationId: string,
    @Param('membershipId') membershipId: string,
    @Request() req: AuthRequest,
    @Body() updateMemberRoleDto: UpdateMemberRoleDto,
  ): Promise<{ id: string; role_id: string; message: string }> {
    return this.accessControlService.changeMemberRole(
      organizationId,
      membershipId,
      updateMemberRoleDto.role_id,
      req.user.id,
    );
  }

  /**
   * Assign a permission override for a membership
   * Security: Only the organization Owner can perform this action
   * Restriction: Cannot assign permission overrides to a member who has the Owner role
   * Secured: User must be the Owner of the organization
   */
  @Post('memberships/:membershipId/overrides')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Assign a permission override to a member',
    description:
      'Allows the organization Owner to grant or revoke specific permissions to a member via permission overrides. Cannot override permissions for the Owner.',
  })
  @ApiParam({
    name: 'orgId',
    description: 'The organization ID',
    format: 'uuid',
  })
  @ApiParam({
    name: 'membershipId',
    description: 'The membership ID to assign override to',
    format: 'uuid',
  })
  @ApiResponse({
    status: 201,
    description: 'Permission override assigned successfully',
    schema: {
      properties: {
        id: { type: 'string', format: 'uuid' },
        permission_id: { type: 'string', format: 'uuid' },
        is_granted: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot override Owner permissions or invalid permission',
  })
  @ApiResponse({
    status: 404,
    description: 'Membership or permission not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Only the organization Owner can perform this action',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async assignPermissionOverride(
    @Param('orgId') organizationId: string,
    @Param('membershipId') membershipId: string,
    @Request() req: AuthRequest,
    @Body() createPermissionOverrideDto: CreatePermissionOverrideDto,
  ): Promise<{
    id: string;
    permission_id: string;
    is_granted: boolean;
    message: string;
  }> {
    return this.accessControlService.assignPermissionOverride(
      organizationId,
      membershipId,
      createPermissionOverrideDto.permission_id,
      createPermissionOverrideDto.is_granted,
      req.user.id,
    );
  }
}
