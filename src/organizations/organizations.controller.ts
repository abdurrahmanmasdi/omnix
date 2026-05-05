import { Controller, Post, Body, UseGuards, Res } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard) // 🛡️ Bouncer active: Must be logged in!
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly orgService: OrganizationsService,
    private readonly authService: AuthService, // Inject Auth to issue new tokens
  ) {}

  @Post()
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
    @CurrentUser() user: AuthenticatedUser, // 🚀 Perfectly typed!
    @Body() dto: CreateOrganizationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // 1. Create the Workspace in Postgres
    const workspace = await this.orgService.createWorkspace(user.id, dto);

    // 2. Generate brand new tokens with the new organizationId and roleId
    // Note: We use the existing generateTokens method from AuthService!
    const newTokens = this.authService.generateTokens(
      user.id,
      user.email,
      workspace.organizationId,
      workspace.roleId,
      user.firstName || '', // Depending on your jwt strategy payload
      user.lastName || '',
    );

    // 3. Set the new Refresh Token cookie
    res.cookie('refresh_token', newTokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      message: 'Workspace created successfully',
      organizationId: workspace.organizationId,
      access_token: newTokens.accessToken,
    };
  }
}
