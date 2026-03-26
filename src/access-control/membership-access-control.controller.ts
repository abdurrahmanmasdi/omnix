import {
  Controller,
  Post,
  Patch,
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
import { AccessControlService } from './access-control.service';
import { UpdateMemberRoleDto } from './dtos/update-member-role.dto';
import { CreatePermissionOverrideDto } from './dtos/create-permission-override.dto';

interface AuthRequest extends ExpressRequest {
  user: { id: string };
}

@ApiTags('membership-access-control')
@Controller('organizations/:orgId/memberships/:membershipId')
@ApiBearerAuth()
export class MembershipAccessControlController {
  constructor(private readonly accessControlService: AccessControlService) {}

  /**
   * Assign a role to an organization member
   * Secured: User must have ACTIVE membership in the organization
   */
  @Patch('role')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Assign a role to a member',
    description:
      'Updates the role assigned to an organization member. The new role must belong to the same organization.',
  })
  @ApiParam({
    name: 'orgId',
    description: 'The organization ID',
    format: 'uuid',
  })
  @ApiParam({
    name: 'membershipId',
    description: 'The membership ID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Role assigned successfully',
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
    description: 'Invalid input',
  })
  @ApiResponse({
    status: 404,
    description: 'Membership or role not found',
  })
  @ApiResponse({
    status: 403,
    description: 'User is not authorized for this organization',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async assignRole(
    @Param('orgId') organizationId: string,
    @Param('membershipId') membershipId: string,
    @Request() req: AuthRequest,
    @Body() updateMemberRoleDto: UpdateMemberRoleDto,
  ): Promise<{ id: string; role_id: string; message: string }> {
    return this.accessControlService.assignRoleToMember(
      organizationId,
      membershipId,
      req.user.id,
      updateMemberRoleDto,
    );
  }

  /**
   * Create a permission override for an organization member
   * Allows granting or revoking specific permissions for a member
   * Secured: User must have ACTIVE membership in the organization
   */
  @Post('overrides')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create or update a permission override for a member',
    description:
      "Creates or updates a permission override for a member. Overrides can grant or revoke specific permissions regardless of the member's role.",
  })
  @ApiParam({
    name: 'orgId',
    description: 'The organization ID',
    format: 'uuid',
  })
  @ApiParam({
    name: 'membershipId',
    description: 'The membership ID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 201,
    description: 'Permission override created successfully',
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
    description: 'Invalid input',
  })
  @ApiResponse({
    status: 404,
    description: 'Membership or permission not found',
  })
  @ApiResponse({
    status: 403,
    description: 'User is not authorized for this organization',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createPermissionOverride(
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
    return this.accessControlService.createPermissionOverride(
      organizationId,
      membershipId,
      req.user.id,
      createPermissionOverrideDto,
    );
  }
}
