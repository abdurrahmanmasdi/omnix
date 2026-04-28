import { Test, TestingModule } from '@nestjs/testing';
import { LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const leadCountMock = jest.fn();
  const leadAggregateMock = jest.fn();
  const leadGroupByMock = jest.fn();
  const leadFindManyMock = jest.fn();
  const leadSourceFindManyMock = jest.fn();

  const mockPrismaService = {
    lead: {
      count: leadCountMock,
      aggregate: leadAggregateMock,
      groupBy: leadGroupByMock,
      findMany: leadFindManyMock,
    },
    leadSource: {
      findMany: leadSourceFindManyMock,
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('getDashboardStats', () => {
    it('calculates won deals, revenue, and conversion without agent scope', async () => {
      leadCountMock.mockResolvedValueOnce(10).mockResolvedValueOnce(4);
      leadAggregateMock.mockResolvedValueOnce({
        _sum: { estimated_value: new Prisma.Decimal('2500.50') },
      });

      const result = await service.getDashboardStats('org-1');

      expect(leadCountMock).toHaveBeenNthCalledWith(1, {
        where: {},
      });
      expect(leadCountMock).toHaveBeenNthCalledWith(2, {
        where: { status: LeadStatus.WON },
      });
      expect(leadAggregateMock).toHaveBeenCalledWith({
        where: { status: LeadStatus.WON },
        _sum: { estimated_value: true },
      });
      expect(result).toEqual({
        won_deals: 4,
        total_revenue: 2500.5,
        lead_conversion_rate: 40,
      });
    });

    it('applies assigned agent scope when agent_id is provided', async () => {
      leadCountMock.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
      leadAggregateMock.mockResolvedValueOnce({
        _sum: { estimated_value: new Prisma.Decimal('900') },
      });

      await service.getDashboardStats('org-1', 'agent-1');

      expect(leadCountMock).toHaveBeenNthCalledWith(1, {
        where: { assigned_agent_id: 'agent-1' },
      });
      expect(leadCountMock).toHaveBeenNthCalledWith(2, {
        where: {
          assigned_agent_id: 'agent-1',
          status: LeadStatus.WON,
        },
      });
      expect(leadAggregateMock).toHaveBeenCalledWith({
        where: {
          assigned_agent_id: 'agent-1',
          status: LeadStatus.WON,
        },
        _sum: { estimated_value: true },
      });
    });
  });
});
