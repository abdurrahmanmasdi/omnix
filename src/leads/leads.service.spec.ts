import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LeadStatus } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { PermissionsService } from '../auth/services/permissions.service';
import { AppPermission } from '../constants/permissions.registry';
import { PrismaService } from '../prisma/prisma.service';
import { LeadsService } from './leads.service';

describe('LeadsService', () => {
  let service: LeadsService;

  type FindManyWhereArg = {
    where: {
      AND: Array<Record<string, unknown>>;
    };
  };

  const mockPrismaService = {
    lead: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    pipelineStage: {
      findFirst: jest.fn(),
    },
    leadSource: {
      findFirst: jest.fn(),
    },
    organizationMembership: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockPermissionsService = {
    getEffectivePermissions: jest.fn(),
  };

  const mockI18nService = {
    t: jest.fn((key: string) => key),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrismaService.$transaction.mockImplementation(
      async (queries: Array<Promise<unknown>>) => Promise.all(queries),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: PermissionsService,
          useValue: mockPermissionsService,
        },
        {
          provide: I18nService,
          useValue: mockI18nService,
        },
      ],
    }).compile();

    service = module.get<LeadsService>(LeadsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll scope branching', () => {
    const organizationId = 'org-1';
    const userId = 'user-1';

    const getFirstFindManyWhereArg = (): FindManyWhereArg => {
      const findManyMock = mockPrismaService.lead.findMany as jest.Mock<
        unknown,
        [FindManyWhereArg]
      >;
      const firstCall = findManyMock.mock.calls[0];

      expect(firstCall).toBeDefined();

      if (!firstCall) {
        throw new Error('Expected lead.findMany to be called at least once.');
      }

      return firstCall[0];
    };

    it('queries all organization leads when user has read_all-equivalent permission', async () => {
      mockPermissionsService.getEffectivePermissions.mockResolvedValueOnce([
        AppPermission.LEADS_READ_ALL,
      ]);
      mockPrismaService.lead.findMany.mockResolvedValueOnce([]);
      mockPrismaService.lead.count.mockResolvedValueOnce(0);

      await service.findAll(organizationId, userId, {
        status: LeadStatus.OPEN,
      });

      const findManyArgs = getFirstFindManyWhereArg();
      const conditions = findManyArgs.where.AND;

      expect(conditions).toEqual(
        expect.arrayContaining([
          { organization_id: organizationId },
          { status: LeadStatus.OPEN },
        ]),
      );
      expect(
        conditions.some((condition) => condition.assigned_agent_id === userId),
      ).toBe(false);
    });

    it('queries only assigned leads when user lacks read_all permission', async () => {
      mockPermissionsService.getEffectivePermissions.mockResolvedValueOnce([
        AppPermission.LEADS_READ,
      ]);
      mockPrismaService.lead.findMany.mockResolvedValueOnce([]);
      mockPrismaService.lead.count.mockResolvedValueOnce(0);

      await service.findAll(organizationId, userId);

      const findManyArgs = getFirstFindManyWhereArg();

      expect(findManyArgs.where.AND).toEqual(
        expect.arrayContaining([
          { organization_id: organizationId },
          { assigned_agent_id: userId },
        ]),
      );
    });

    it('throws BadRequestException when a UUID filter field receives invalid value', async () => {
      mockPermissionsService.getEffectivePermissions.mockResolvedValueOnce([
        AppPermission.LEADS_READ_ALL,
      ]);

      await expect(
        service.findAll(organizationId, userId, {
          filters: JSON.stringify([
            {
              field: 'pipeline_stage_id',
              operator: 'equals',
              value: '2',
            },
          ]),
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockI18nService.t).toHaveBeenCalledWith(
        'errors.LEADS.INVALID_FILTERS',
      );
      expect(mockPrismaService.lead.findMany).not.toHaveBeenCalled();
      expect(mockPrismaService.lead.count).not.toHaveBeenCalled();
    });
  });

  describe('findOne forbidden-on-foreign-lead behavior', () => {
    it('throws ForbiddenException when agent tries to access lead assigned to someone else', async () => {
      mockPermissionsService.getEffectivePermissions.mockResolvedValueOnce([
        AppPermission.LEADS_READ,
      ]);

      // Scoped query (assigned to current user) misses.
      mockPrismaService.lead.findFirst
        .mockResolvedValueOnce(null)
        // Existence check in organization succeeds -> forbidden.
        .mockResolvedValueOnce({ id: 'lead-1' });

      await expect(
        service.findOne('org-1', 'user-1', 'lead-1'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockI18nService.t).toHaveBeenCalledWith(
        'errors.LEADS.ACCESS_FORBIDDEN',
      );
    });
  });

  describe('delete behavior', () => {
    it('deletes lead only within organization scope', async () => {
      mockPrismaService.lead.deleteMany.mockResolvedValueOnce({ count: 1 });

      await service.remove('org-1', 'lead-1');

      expect(mockPrismaService.lead.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'lead-1',
          organization_id: 'org-1',
        },
      });
    });

    it('throws NotFoundException when scoped delete matches no lead', async () => {
      mockPrismaService.lead.deleteMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.remove('org-1', 'lead-1')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockI18nService.t).toHaveBeenCalledWith('errors.LEADS.NOT_FOUND');
    });
  });
});
