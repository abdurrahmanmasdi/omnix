import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../auth/permission.service';

describe('AnalyticsService', () => {
  let provider: AnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: { methodName: jest.fn() } },
        {
          provide: PermissionService,
          useValue: { has: jest.fn().mockResolvedValue(true) },
        },
      ],
      controllers: [],
    }).compile();

    provider = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
