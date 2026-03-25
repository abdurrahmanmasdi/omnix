import {
  Controller,
  Post,
  Body,
  Request,
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
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dtos/create-organization.dto';
import { JoinOrganizationDto } from './dtos/join-organization.dto';
import { InviteToOrganizationDto } from './dtos/invite-organization.dto';

export interface IOrganization {
  id: string;
  name: string;
  slug: string;
  is_public: boolean;
  created_at: Date;
}

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

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
    @Request() req: any,
    @Body() createOrgDto: CreateOrganizationDto,
  ): Promise<IOrganization> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
    return this.organizationsService.create(req.user.id, createOrgDto);
  }

  /**
   * Join an existing organization by slug
   * Creates a membership with status 'pending_approval'
   */
  @Post('join')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Request to join an organization',
    description: 'Creates a membership request with pending_approval status',
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
    @Request() req: any,
    @Body() joinOrgDto: JoinOrganizationDto,
  ): Promise<{ message: string; organizationId: string }> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
    return this.organizationsService.join(req.user.id, joinOrgDto);
  }

  /**
   * Invite a user to an organization by email
   * Saves an invitation record with a required roleId
   */
  @Post(':organizationId/invite')
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
        message: { type: 'string' },
        invitationId: { type: 'string', format: 'uuid' },
        status: {
          type: 'string',
          enum: ['invitation_created', 'invitation_updated'],
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input (invalid email)' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  @ApiResponse({ status: 409, description: 'User is already a member' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async invite(
    @Param('organizationId') organizationId: string,
    @Request() req: any,
    @Body() inviteDto: InviteToOrganizationDto,
  ): Promise<{
    message: string;
    invitationId: string;
    status: 'invitation_created' | 'invitation_updated';
  }> {
    return this.organizationsService.invite(organizationId, inviteDto);
  }
}
