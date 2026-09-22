import {
  Controller,
  Post,
  Patch,
  Body,
  UseGuards,
  Res,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import axios from 'axios';
import type { Response } from 'express';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateCrmTokenDto } from './dto/update-crm-token.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtUserGuard } from '../auth/guards/jwt-user.guard';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { getRefreshCookieOptions, REFRESH_COOKIE_NAME } from '../auth/cookie.helper';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly orgService: OrganizationsService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @UseGuards(JwtUserGuard) // 🛡️ User must be logged in, but organization is NOT required
  @ApiOperation({ summary: 'Create a new organization and get updated tokens' })
  @ApiResponse({
    status: 201,
    description: 'Organization created successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        organizationId: { type: 'string' },
        access_token: { type: 'string' },
      },
      required: ['message', 'organizationId', 'access_token'],
    },
  })
  async createOrganization(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrganizationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // 1. Create the Workspace in Postgres
    const workspace = await this.orgService.createWorkspace(user.id, dto);

    // 2. Generate brand new tokens with the new organizationId and roleId
    const newTokens = this.authService.generateTokens(
      user.id,
      user.email,
      workspace.organizationId,
      workspace.roleId,
      user.firstName || '',
      user.lastName || '',
    );

    // 3. Set the new Refresh Token cookie using shared helper
    res.cookie(REFRESH_COOKIE_NAME, newTokens.refreshToken, getRefreshCookieOptions());

    return {
      message: 'Workspace created successfully',
      organizationId: workspace.organizationId,
      access_token: newTokens.accessToken,
    };
  }

  @Patch('crm-token')
  @UseGuards(JwtAuthGuard) // 🛡️ Must have active organization membership

  @ApiOperation({ summary: 'Update the HubSpot CRM access token for the current organization' })
  @ApiResponse({
    status: 200,
    description: 'CRM token updated successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        organizationId: { type: 'string' },
      },
    },
  })
  async updateCrmToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCrmTokenDto,
  ) {
    if (!user.organizationId) {
      throw new ForbiddenException('User is not associated with an organization');
    }

    const organization = await this.orgService.updateCrmToken(
      user.organizationId,
      dto.crmAccessToken,
    );

    return {
      message: 'CRM token updated successfully',
      organizationId: organization.id,
    };
  }

  @Post('crm-token/test')
  @UseGuards(JwtAuthGuard) // 🛡️ Must have active organization membership
  @ApiOperation({ summary: 'Smoke-test the stored HubSpot CRM access token' })
  @ApiResponse({
    status: 200,
    description: 'CRM token is valid',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        hubSpotAppId: { type: 'number' },
        hubSpotPortalId: { type: 'number' },
      },
    },
  })
  async testCrmToken(@CurrentUser() user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new ForbiddenException('User is not associated with an organization');
    }

    const organization = await this.orgService.findById(user.organizationId);
    if (!organization?.crmAccessToken) {
      throw new ForbiddenException('No HubSpot token configured for this organization');
    }

    try {
      const { data } = await axios.get(
        'https://api.hubapi.com/integrations/v1/me',
        {
          headers: {
            Authorization: `Bearer ${organization.crmAccessToken}`,
          },
        },
      );

      return {
        message: 'HubSpot token is valid',
        hubSpotAppId: data.app_id,
        hubSpotPortalId: data.portal_id,
      };
    } catch (error: any) {
      const message =
        error.response?.data?.message || error.message || 'HubSpot token test failed';
      throw new ForbiddenException(message);
    }
  }
}
