import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { WeeklyReportService } from './weekly-report.service';
import { AnalyticsService } from './analytics.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, WeeklyReportService],
})
export class AnalyticsModule {}
