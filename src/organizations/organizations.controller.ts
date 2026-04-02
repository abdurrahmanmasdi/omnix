import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { OrganizationsService } from './organizations.service';
import { MembershipsService } from './memberships.service';
import { InvitationsService } from './invitations.service';
import { CreateOrganizationDto } from './dtos/create-organization.dto';
import { UpdateOrganizationDto } from './dtos/update-organization.dto';
import { JoinOrganizationDto } from './dtos/join-organization.dto';
import { InviteToOrganizationDto } from './dtos/invite-organization.dto';
import { ApproveMembershipRequestDto } from './dtos/approve-membership-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Public } from '../auth/decorators/public/public.decorator';
import { AppPermission } from '../constants/permissions.registry';

export interface IOrganization {
  id: string;
  name: string;
  slug: string;
  is_public: boolean;
  created_at: Date;
}

interface AuthRequest extends ExpressRequest {
  user: {
    id: string;
    email: string;
  };
}

interface InvitationPreviewResponse {
  organizationName: string;
  roleName: string;
  email: string;
  status: string;
}

interface InvitationAcceptResponse {
  message: string;
  organizationId: string;
  membershipId: string;
}

interface PendingInvitationResponse {
  id: string;
  token: string;
  email: string;
  status: string;
  created_at: Date;
  inviteUrl: string;
  role: {
    id: string;
    name: string;
  };
}

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly membershipsService: MembershipsService,
    private readonly invitationsService: InvitationsService,
  ) {}

  /**
   * List pending join requests for a specific organization.
   *
   * Security:
   * - Requires a valid JWT
   * - Service layer verifies the current user has active membership in the target organization
   */
  @Get(':id/requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pending join requests for an organization' })
  @ApiResponse({ status: 200, description: 'Pending join requests retrieved' })
  @ApiResponse({
    status: 403,
    description: 'User is not authorized for this organization',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPendingRequests(
    @Param('id') organizationId: string,
    @Request() req: AuthRequest,
  ) {
    return this.membershipsService.getPendingRequests(
      organizationId,
      req.user.id,
    );
  }

  /**
   * Create a new organization
   * Automatically creates an OrganizationMembership for the requesting user
   * with role 'owner' and status 'active'
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new organization' })
  @ApiResponse({
    status: 201,
    description: 'Organization created successfully with owner membership',
    schema: {
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        slug: { type: 'string' },
        is_public: { type: 'boolean' },
        created_at: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 409, description: 'Organization slug already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(
    @Request() req: AuthRequest,
    @Body() createOrgDto: CreateOrganizationDto,
  ): Promise<IOrganization> {
    return this.organizationsService.create(req.user.id, createOrgDto);
  }

  /**
   * Get an organization by ID
   *
   * Security:
   * - Requires a valid JWT
   * - Requires ORGANIZATION_READ permission for the requested organization
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.ORGANIZATION_READ)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get organization details' })
  @ApiResponse({
    status: 200,
    description: 'Organization details retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  @ApiResponse({
    status: 403,
    description: 'User is not authorized for this organization',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getOrganization(
    @Param('id') organizationId: string,
  ): Promise<IOrganization> {
    return this.organizationsService.findById(organizationId);
  }

  /**
   * Update an organization
   *
   * Security:
   * - Requires a valid JWT
   * - Requires ORGANIZATION_EDIT permission for the requested organization
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.ORGANIZATION_EDIT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update organization settings' })
  @ApiResponse({
    status: 200,
    description: 'Organization updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  @ApiResponse({
    status: 403,
    description: 'User is not authorized for this organization',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateOrganization(
    @Param('id') organizationId: string,
    @Body() updateOrgDto: UpdateOrganizationDto,
  ): Promise<IOrganization> {
    return this.organizationsService.update(organizationId, updateOrgDto);
  }

  /**
   * Join an existing organization by slug
   * Creates a membership with status 'PENDING'
   */
  @Post('join')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Request to join an organization',
    description: 'Creates a membership request with PENDING status',
  })
  @ApiResponse({
    status: 201,
    description: 'Join request created successfully',
    schema: {
      properties: {
        message: { type: 'string' },
        organizationId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  @ApiResponse({ status: 409, description: 'User is already a member' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async join(
    @Request() req: AuthRequest,
    @Body() joinOrgDto: JoinOrganizationDto,
  ): Promise<{ message: string; organizationId: string }> {
    return this.membershipsService.join(req.user.id, joinOrgDto);
  }

  /**
   * Invite a user to an organization by email
   * Saves an invitation record with a required roleId
   */
  @Post(':organizationId/invite')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.TEAM_MEMBERS_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Invite a user to an organization',
    description:
      'Creates or updates an invitation record and stores the selected role for acceptance.',
  })
  @ApiResponse({
    status: 201,
    description: 'User invited successfully',
    schema: {
      properties: {
        inviteUrl: { type: 'string' },
        token: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input (invalid email)' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  @ApiResponse({ status: 409, description: 'User is already a member' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async invite(
    @Param('organizationId') organizationId: string,
    @Request() req: AuthRequest,
    @Body() inviteDto: InviteToOrganizationDto,
  ): Promise<{
    inviteUrl: string;
    token: string;
  }> {
    return this.invitationsService.invite(
      organizationId,
      req.user.id,
      inviteDto,
    );
  }

  @Get(':id/invitations')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List pending invitations for an organization',
    description:
      'Returns pending invitations for the organization. Access is restricted to owner/admin/manager users of that organization.',
  })
  @ApiResponse({
    status: 200,
    description: 'Pending invitations retrieved successfully',
    schema: {
      type: 'array',
      items: {
        properties: {
          id: { type: 'string', format: 'uuid' },
          token: { type: 'string' },
          email: { type: 'string', format: 'email' },
          status: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
          inviteUrl: { type: 'string' },
          role: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listPendingInvitations(
    @Param('id') organizationId: string,
    @Request() req: AuthRequest,
  ): Promise<PendingInvitationResponse[]> {
    return this.invitationsService.listPendingInvitations(
      organizationId,
      req.user.id,
    );
  }

  @Get('invitations/:token')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get invitation details by token',
    description:
      'Returns non-sensitive invitation details used by the invitation landing page.',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitation details retrieved successfully',
    schema: {
      properties: {
        organizationName: { type: 'string' },
        roleName: { type: 'string' },
        email: { type: 'string', format: 'email' },
        status: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  async getInvitationByToken(
    @Param('token') token: string,
  ): Promise<InvitationPreviewResponse> {
    return this.invitationsService.getInvitationByToken(token);
  }

  @Post('invitations/:token/accept')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Accept invitation by token for authenticated users',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitation accepted and membership created',
    schema: {
      properties: {
        message: { type: 'string' },
        organizationId: { type: 'string', format: 'uuid' },
        membershipId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid invitation state' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  @ApiResponse({
    status: 409,
    description: 'User already has active membership',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async acceptInvitation(
    @Param('token') token: string,
    @Request() req: AuthRequest,
  ): Promise<InvitationAcceptResponse> {
    return this.invitationsService.acceptInvitation(
      token,
      req.user.id,
      req.user.email,
    );
  }

  @Post(':id/requests/:membershipId/approve')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.TEAM_MEMBERS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Approve a pending join request',
    description:
      'Approves a pending membership request and assigns a role to the user. Requires team_members:manage permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'Join request approved successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid request state or role' })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions to approve requests',
  })
  @ApiResponse({
    status: 404,
    description: 'Organization or membership not found',
  })
  async approveRequest(
    @Param('id') organizationId: string,
    @Param('membershipId') membershipId: string,
    @Request() req: AuthRequest,
    @Body() approveDto: ApproveMembershipRequestDto,
  ) {
    return this.membershipsService.approveJoinRequest(
      organizationId,
      membershipId,
      req.user.id,
      approveDto,
    );
  }

  @Post(':id/requests/:membershipId/reject')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.TEAM_MEMBERS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reject a pending join request',
    description: 'Rejects a pending membership request for an organization.',
  })
  @ApiResponse({
    status: 200,
    description: 'Join request rejected successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid request state' })
  @ApiResponse({
    status: 403,
    description: 'Only organization admins can reject requests',
  })
  @ApiResponse({
    status: 404,
    description: 'Organization or membership not found',
  })
  async rejectRequest(
    @Param('id') organizationId: string,
    @Param('membershipId') membershipId: string,
    @Request() req: AuthRequest,
  ) {
    return this.membershipsService.rejectJoinRequest(
      organizationId,
      membershipId,
      req.user.id,
    );
  }

  /**
   * Get all active members of an organization with their assigned roles.
   *
   * Security:
   * - Requires a valid JWT
   * - Service layer verifies the current user has active membership in the target organization
   */
  @Get(':id/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all active members of an organization' })
  @ApiResponse({
    status: 200,
    description: 'Active members retrieved successfully',
    schema: {
      type: 'array',
      items: {
        properties: {
          membershipId: { type: 'string', format: 'uuid' },
          organizationId: { type: 'string', format: 'uuid' },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              email: { type: 'string', format: 'email' },
            },
          },
          role: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
            },
          },
          status: { type: 'string', enum: ['ACTIVE'] },
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'User is not authorized for this organization',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMembers(
    @Param('id') organizationId: string,
    @Request() req: AuthRequest,
  ) {
    return this.membershipsService.getOrganizationMembers(
      organizationId,
      req.user.id,
    );
  }
}
