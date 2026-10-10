import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { WeeklyReportService } from './weekly-report.service';
import { AnalyticsService } from './analytics.service';
import { PermissionService } from '../auth/permission.service';

describe('AnalyticsController', () => {
  let provider: AnalyticsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsController,
        { provide: WeeklyReportService, useValue: {} },
        { provide: AnalyticsService, useValue: { methodName: jest.fn() } },
        {
          provide: PermissionService,
          useValue: { has: jest.fn().mockResolvedValue(true) },
        },
      ],
      controllers: [AnalyticsController],
    }).compile();

    provider = module.get<AnalyticsController>(AnalyticsController);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
