import {
  Controller,
  Get,
  Post,
  Delete,
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
} from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';

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
   */
  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description: "Returns the authenticated user's profile information",
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
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User profile not found' })
  async getCurrentUser(@Request() req: AuthRequest) {
    return this.usersService.getCurrentUserProfile(req.user.id);
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
}
