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
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtUserGuard } from '../auth/guards/jwt-user.guard';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  getRefreshCookieOptions,
  REFRESH_COOKIE_NAME,
} from '../auth/cookie.helper';

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
    const newTokens = await this.authService.generateTokens(
      user.id,
      user.email,
      workspace.organizationId,
      workspace.roleId,
      user.firstName || '',
      user.lastName || '',
    );

    // 3. Set the new Refresh Token cookie using shared helper
    res.cookie(
      REFRESH_COOKIE_NAME,
      newTokens.refreshToken,
      getRefreshCookieOptions(),
    );

    return {
      message: 'Workspace created successfully',
      organizationId: workspace.organizationId,
      access_token: newTokens.accessToken,
    };
  }
}
