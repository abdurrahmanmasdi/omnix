import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsController', () => {
  let provider: AnalyticsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsController,
        { provide: AnalyticsService, useValue: { methodName: jest.fn() } },
      ],
      controllers: [AnalyticsController],
    }).compile();

    provider = module.get<AnalyticsController>(AnalyticsController);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
