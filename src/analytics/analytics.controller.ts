import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { AccessVerificationService } from '../access-control/access-verification.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { GlobalAuthGuard } from '../auth/guards/global-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AppPermission } from '../constants/permissions.registry';
import { AnalyticsService, DashboardMetrics } from './analytics.service';

interface AuthRequest extends ExpressRequest {
  user: {
    id: string;
  };
}

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('organizations/:organizationId/analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly accessVerificationService: AccessVerificationService,
  ) {}

  @Get('dashboard')
  @UseGuards(JwtAuthGuard, GlobalAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.ORGANIZATION_READ)
  @ApiOperation({ summary: 'Get dashboard analytics metrics' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard analytics metrics fetched successfully',
  })
  async getDashboardMetrics(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Request() req: AuthRequest,
  ): Promise<DashboardMetrics> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    return this.analyticsService.getDashboardMetrics(organizationId);
  }
}
