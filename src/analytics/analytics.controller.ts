import {
  Controller,
  Get,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AnalyticsSummaryDto } from './dto/analytics-summary.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

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
