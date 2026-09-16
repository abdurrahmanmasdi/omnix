import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AnalyticsService', () => {
  let provider: AnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: { methodName: jest.fn() } }
      ],
      controllers: []
    }).compile();

    provider = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
