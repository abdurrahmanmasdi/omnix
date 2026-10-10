import {
  Controller,
  Get,
  Header,
  Query,
  ValidationPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WeeklyReportService } from './weekly-report.service';
import {
  WeeklyReportDto,
  WeeklyReportQueryDto,
  WeeklyReportAccessDto,
  WEEKLY_PERMISSIONS,
} from './dto/weekly-report.dto';
import { AnalyticsService } from './analytics.service';
import { AnalyticsSummaryDto } from './dto/analytics-summary.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly weekly: WeeklyReportService,
  ) {}

  @Get('weekly-report/access')
  @RequirePermissions(...WEEKLY_PERMISSIONS)
  @Header('Cache-Control', 'private, no-store')
  @ApiResponse({ status: 200, type: WeeklyReportAccessDto })
  getWeeklyAccess() {
    return { allowed: true };
  }

  @Get('weekly-report')
  @RequirePermissions(...WEEKLY_PERMISSIONS)
  @Header('Cache-Control', 'private, no-store')
  @ApiResponse({ status: 200, type: WeeklyReportDto })
  @ApiResponse({ status: 422, description: 'WEEKLY_REPORT_TOO_LARGE' })
  getWeeklyReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    query: WeeklyReportQueryDto,
  ) {
    if (!user.organizationId)
      throw new BadRequestException('Missing organization context');
    return this.weekly.getReport(user.organizationId, { ...query });
  }

  @RequirePermissions('analytics:view')
  @Get('summary')
  @ApiOperation({ summary: 'Get aggregated analytics for the dashboard' })
  @ApiResponse({
    status: 200,
    description: 'Returns the analytics summary',
    type: AnalyticsSummaryDto,
  })
  async getSummary(@CurrentUser() user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new BadRequestException('Organization not found for the user');
    }
    return this.analyticsService.getSummary(user.organizationId);
  }
}
