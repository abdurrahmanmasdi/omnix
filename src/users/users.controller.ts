import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
  BadRequestException,
  Body,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateUserProfileDto } from './dtos/update-user-profile.dto';
import { UpdateMemberProfileDto } from './dtos/update-member-profile.dto';

interface AuthRequest extends ExpressRequest {
  user: { id: string };
}

@ApiTags('users')
@Controller('users')
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Get the currently authenticated user's profile
   * Note: This endpoint does NOT require x-organization-id header
   * If provided, includes effective permissions for that organization
   */
  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile with optional permissions',
    description:
      "Returns the authenticated user's profile information. Include x-organization-id header to get permissions for that organization.",
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    schema: {
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        created_at: { type: 'string', format: 'date-time' },
        permissions: {
          type: 'array',
          items: { type: 'string' },
          description: 'User permissions for the specified organization',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User profile not found' })
  async getCurrentUser(
    @Request() req: AuthRequest,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    const user = await this.usersService.getCurrentUserProfile(req.user.id);

    // Calculate effective permissions if organization ID is provided
    const permissions = await this.usersService.getEffectivePermissions(
      req.user.id,
      organizationId,
    );

    return {
      ...user,
      permissions,
    };
  }

  /**
   * Get the current user's effective permissions for their organization
   * Requires x-organization-id header to determine which organization's permissions to fetch
   */
  @Get('me/permissions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get user permissions for organization',
    description:
      'Returns the effective permissions for the authenticated user in their active organization context. Requires x-organization-id header.',
  })
  @ApiResponse({
    status: 200,
    description: 'Permissions retrieved successfully',
    schema: {
      properties: {
        permissions: {
          type: 'array',
          items: { type: 'string' },
          description:
            'List of permission actions (e.g., "leads:create", "users:manage")',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Organization context required (missing x-organization-id header)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPermissions(
    @Request() req: AuthRequest,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Organization context required');
    }

    const permissions = await this.usersService.getEffectivePermissions(
      req.user.id,
      organizationId,
    );

    return { permissions };
  }

  /**
   * Get all organizations the current user belongs to
   * Returns list of memberships for the "Switch Workspace" dropdown
   * Note: This endpoint does NOT require x-organization-id header
   */
  @Get('me/organizations')
  @ApiOperation({
    summary: "Get user's organizations",
    description:
      'Returns all organizations the user belongs to, used for workspace switching',
  })
  @ApiResponse({
    status: 200,
    description: "List of user's organizations",
    schema: {
      type: 'array',
      items: {
        properties: {
          membership_id: { type: 'string', format: 'uuid' },
          organization_id: { type: 'string', format: 'uuid' },
          role_id: { type: 'string', format: 'uuid' },
          status: {
            type: 'string',
            enum: ['PENDING', 'ACTIVE', 'REJECTED'],
          },
          created_at: { type: 'string', format: 'date-time' },
          organization: {
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              slug: { type: 'string' },
              is_public: { type: 'boolean' },
              created_at: { type: 'string', format: 'date-time' },
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
  async getUserOrganizations(@Request() req: AuthRequest) {
    return this.usersService.getUserOrganizations(req.user.id);
  }

  /**
   * Accept a pending organization invite
   * Creates membership from invitation and marks invitation as accepted
   * Note: This endpoint does NOT require x-organization-id header
   */
  @Post('invites/:inviteId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Accept an organization invite',
    description:
      'Accepts a pending invite and activates the membership. Only works on invites with status "invited".',
  })
  @ApiResponse({
    status: 200,
    description: 'Invite accepted successfully',
    schema: {
      properties: {
        message: { type: 'string' },
        membership_id: { type: 'string', format: 'uuid' },
        organization_name: { type: 'string' },
        role: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid invite status or does not belong to user',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Invite not found' })
  async acceptInvite(
    @Request() req: AuthRequest,
    @Param('inviteId') inviteId: string,
  ) {
    return this.usersService.acceptOrganizationInvite(req.user.id, inviteId);
  }

  @Delete('me/requests/:id/cancel')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel current user pending join request',
    description:
      'Deletes a pending join request that belongs to the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Join request cancelled successfully',
  })
  @ApiResponse({ status: 400, description: 'Request is not in pending state' })
  @ApiResponse({ status: 404, description: 'Membership request not found' })
  async cancelJoinRequest(
    @Request() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    return await this.usersService.cancelJoinRequest(req.user.id, id);
  }

  @Get('performance-profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get performance dashboard profile',
    description:
      'Retrieves combined user profile, membership info, and calculated sales metrics (MTD revenue)',
  })
  @ApiResponse({
    status: 200,
    description: 'Performance profile retrieved successfully',
    schema: {
      properties: {
        user: { type: 'object' },
        membership: { type: 'object' },
        metrics: {
          type: 'object',
          properties: {
            closed_revenue_mtd: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User or membership not found' })
  async getPerformanceProfile(
    @Request() req: AuthRequest,
    @Headers('x-organization-id') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('x-organization-id header is required');
    }
    return this.usersService.getPerformanceProfile(req.user.id, organizationId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Update global user profile',
    description:
      'Updates user profile information that applies across all organizations (avatar, phone, languages, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateGlobalProfile(
    @Request() req: AuthRequest,
    @Body() data: UpdateUserProfileDto,
  ) {
    return this.usersService.updateGlobalProfile(req.user.id, data);
  }

  @Patch('me/membership')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Update membership profile',
    description:
      'Updates organization-specific profile information (job title, tier, specializations, availability, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'Membership profile updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Membership not found' })
  async updateMembershipProfile(
    @Request() req: AuthRequest,
    @Headers('x-organization-id') organizationId: string,
    @Body() data: UpdateMemberProfileDto,
  ) {
    if (!organizationId) {
      throw new BadRequestException('x-organization-id header is required');
    }
    return this.usersService.updateMembershipProfile(
      req.user.id,
      organizationId,
      data,
    );
  }
}
