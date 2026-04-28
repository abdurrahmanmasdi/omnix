import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LeadStatus, Priority } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { PermissionsService } from '../auth/services/permissions.service';
import { AppPermission } from '../constants/permissions.registry';
import { PrismaService } from '../prisma/prisma.service';
import {
  BulkUpdateLeadsDto,
  BulkUpdateLeadDataDto,
} from './dtos/bulk-update-leads.dto';
import { CreateLeadDto } from './dtos/create-lead.dto';
import { UpdateLeadDto } from './dtos/update-lead.dto';
import { LeadsService } from './leads.service';
import { QueryBuilderService } from '../common/query/query-builder.service';

type ServicePrivates = {
  toNullableDate(value?: string | null): Date | null | undefined;
  pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T>;
  hasPermission(effectivePermissions: string[], permission: string): boolean;
};

describe('LeadsService', () => {
  let service: LeadsService;

  const mockPrismaService = {
    lead: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    leadSource: {
      findFirst: jest.fn(),
    },
    organizationMembership: {
      findFirst: jest.fn(),
    },
  };

  const mockPermissionsService = {
    getEffectivePermissions: jest.fn(),
  };

  const mockI18nService = {
    t: jest.fn((key: string) => key),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        QueryBuilderService,
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

  describe('create', () => {
    it('creates lead when optional fields are missing', async () => {
      const dto: CreateLeadDto = {
        first_name: 'John',
        last_name: 'Doe',
        phone_number: '+15550001111',
        country: 'US',
        timezone: 'America/New_York',
        primary_language: 'en',
      };
      const createdLead = { id: 'lead-1' };
      mockPrismaService.lead.create.mockResolvedValueOnce(createdLead);

      const result = await service.create('org-1', 'user-1', dto);

      expect(mockPrismaService.leadSource.findFirst).not.toHaveBeenCalled();
      expect(
        mockPrismaService.organizationMembership.findFirst,
      ).not.toHaveBeenCalled();

      const createCalls = mockPrismaService.lead.create.mock.calls as Array<
        [
          {
            data: {
              organization_id: string;
              first_name: string;
              last_name: string;
              expected_service_date?: Date | null;
              next_follow_up_at?: Date | null;
            };
          },
        ]
      >;
      const createPayload = createCalls[0]?.[0];

      expect(createPayload).toBeDefined();
      if (!createPayload) {
        throw new Error('Expected lead.create payload');
      }

      expect(createPayload.data.organization_id).toBe('org-1');
      expect(createPayload.data.first_name).toBe('John');
      expect(createPayload.data.last_name).toBe('Doe');
      expect(createPayload.data.expected_service_date).toBeUndefined();
      expect(createPayload.data.next_follow_up_at).toBeUndefined();
      expect(result).toEqual(createdLead);
    });

    it('creates lead and converts date strings for optional fields', async () => {
      const dto: CreateLeadDto = {
        first_name: 'Jane',
        last_name: 'Doe',
        phone_number: '+905551112233',
        country: 'TR',
        timezone: 'Europe/Istanbul',
        primary_language: 'tr',
        source_id: '22222222-2222-4222-8222-222222222222',
        assigned_agent_id: '33333333-3333-4333-8333-333333333333',
        expected_service_date: '2026-05-01T10:00:00.000Z',
        next_follow_up_at: '2026-05-02T10:00:00.000Z',
      };

      mockPrismaService.leadSource.findFirst.mockResolvedValueOnce({
        id: dto.source_id,
        is_active: true,
      });
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'membership-1',
      });
      mockPrismaService.lead.create.mockResolvedValueOnce({ id: 'lead-2' });

      await service.create('org-1', 'user-1', dto);

      const createCalls = mockPrismaService.lead.create.mock.calls as Array<
        [
          {
            data: {
              expected_service_date?: Date | null;
              next_follow_up_at?: Date | null;
            };
          },
        ]
      >;
      const createPayload = createCalls[0]?.[0];

      expect(createPayload).toBeDefined();
      if (!createPayload) {
        throw new Error('Expected lead.create payload');
      }

      expect(createPayload.data.expected_service_date).toEqual(
        new Date(dto.expected_service_date!),
      );
      expect(createPayload.data.next_follow_up_at).toEqual(
        new Date(dto.next_follow_up_at!),
      );
    });

    it('throws when source is outside organization scope', async () => {
      mockPrismaService.leadSource.findFirst.mockResolvedValueOnce(null);

      const dto: CreateLeadDto = {
        first_name: 'Jane',
        last_name: 'Doe',
        phone_number: '+905551112233',
        country: 'TR',
        timezone: 'Europe/Istanbul',
        primary_language: 'tr',
        source_id: '22222222-2222-4222-8222-222222222222',
      };

      await expect(service.create('org-1', 'user-1', dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockI18nService.t).toHaveBeenCalledWith(
        'leads.ERRORS.SOURCE_OUTSIDE_SCOPE',
      );
    });

    it('throws when source is inactive', async () => {
      mockPrismaService.leadSource.findFirst.mockResolvedValueOnce({
        id: 'source-1',
        is_active: false,
      });

      const dto: CreateLeadDto = {
        first_name: 'Jane',
        last_name: 'Doe',
        phone_number: '+905551112233',
        country: 'TR',
        timezone: 'Europe/Istanbul',
        primary_language: 'tr',
        source_id: '22222222-2222-4222-8222-222222222222',
      };

      await expect(service.create('org-1', 'user-1', dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockI18nService.t).toHaveBeenCalledWith(
        'leads.ERRORS.SOURCE_INACTIVE',
      );
    });

    it('throws when assigned agent is not active in organization', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
        null,
      );

      const dto: CreateLeadDto = {
        first_name: 'Jane',
        last_name: 'Doe',
        phone_number: '+905551112233',
        country: 'TR',
        timezone: 'Europe/Istanbul',
        primary_language: 'tr',
        assigned_agent_id: '33333333-3333-4333-8333-333333333333',
      };

      await expect(service.create('org-1', 'user-1', dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockI18nService.t).toHaveBeenCalledWith(
        'leads.ERRORS.ASSIGNED_AGENT_OUTSIDE_SCOPE',
      );
    });
  });

  describe('findAll', () => {
    it('reads all leads when wildcard permission exists', async () => {
      mockPermissionsService.getEffectivePermissions.mockResolvedValueOnce([
        '*',
      ]);
      mockPrismaService.lead.count.mockResolvedValueOnce(2);
      mockPrismaService.lead.findMany.mockResolvedValueOnce([
        { id: 'lead-1' },
        { id: 'lead-2' },
      ]);

      const result = await service.findAll('org-1', 'user-1');

      expect(mockPrismaService.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [] },
          skip: 0,
          take: 20,
        }),
      );
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('reads all leads when namespace wildcard permission exists', async () => {
      mockPermissionsService.getEffectivePermissions.mockResolvedValueOnce([
        'leads:*',
      ]);
      mockPrismaService.lead.count.mockResolvedValueOnce(0);
      mockPrismaService.lead.findMany.mockResolvedValueOnce([]);

      await service.findAll('org-1', 'user-1', {
        page: 2,
        limit: 200,
        sort_by: 'first_name',
        sort_dir: 'asc',
      });

      expect(mockPrismaService.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 100,
          take: 100,
          orderBy: { first_name: 'asc' },
          where: { AND: [] },
        }),
      );
    });

    it('restricts to assigned leads without elevated permission and appends dynamic filter conditions', async () => {
      mockPermissionsService.getEffectivePermissions.mockResolvedValueOnce([
        AppPermission.LEADS_READ,
      ]);
      mockPrismaService.lead.count.mockResolvedValueOnce(1);
      mockPrismaService.lead.findMany.mockResolvedValueOnce([{ id: 'lead-1' }]);

      await service.findAll('org-1', 'user-1', {
        status: LeadStatus.OPEN,
        priority: Priority.HOT,
        filters: JSON.stringify([
          { field: 'country', operator: 'equals', value: 'TR' },
          { field: 'not_allowed', operator: 'equals', value: 'x' },
        ]),
      });

      expect(mockPrismaService.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { assigned_agent_id: 'user-1' },
              { status: LeadStatus.OPEN },
              { priority: Priority.HOT },
              { country: 'TR' },
            ],
          },
        }),
      );
    });

    it('applies case-insensitive search across name, email, and phone fields', async () => {
      mockPermissionsService.getEffectivePermissions.mockResolvedValueOnce([
        AppPermission.LEADS_READ_ALL,
      ]);
      mockPrismaService.lead.count.mockResolvedValueOnce(1);
      mockPrismaService.lead.findMany.mockResolvedValueOnce([{ id: 'lead-1' }]);

      await service.findAll('org-1', 'user-1', {
        search: 'john',
      });

      expect(mockPrismaService.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: [
                  {
                    first_name: { contains: 'john', mode: 'insensitive' },
                  },
                  {
                    last_name: { contains: 'john', mode: 'insensitive' },
                  },
                  { email: { contains: 'john', mode: 'insensitive' } },
                  {
                    phone_number: { contains: 'john', mode: 'insensitive' },
                  },
                ],
              },
            ],
          },
        }),
      );
    });

    it('throws BadRequestException for invalid JSON filter strings', async () => {
      mockPermissionsService.getEffectivePermissions.mockResolvedValueOnce([
        AppPermission.LEADS_READ_ALL,
      ]);

      await expect(
        service.findAll('org-1', 'user-1', { filters: '{invalid-json' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockI18nService.t).toHaveBeenCalledWith(
        'leads.ERRORS.INVALID_FILTERS',
      );
      expect(mockPrismaService.lead.count).not.toHaveBeenCalled();
      expect(mockPrismaService.lead.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns lead when found and caller has read-all permission', async () => {
      const lead = { id: 'lead-1' };
      mockPermissionsService.getEffectivePermissions.mockResolvedValueOnce([
        AppPermission.LEADS_READ_ALL,
      ]);
      mockPrismaService.lead.findFirst.mockResolvedValueOnce(lead);

      await expect(
        service.findOne('org-1', 'user-1', 'lead-1'),
      ).resolves.toEqual(lead);
      expect(mockPrismaService.lead.findFirst).toHaveBeenCalledTimes(1);
    });

    it('throws NotFound when lead is missing for read-all callers', async () => {
      mockPermissionsService.getEffectivePermissions.mockResolvedValueOnce([
        AppPermission.LEADS_READ_ALL,
      ]);
      mockPrismaService.lead.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.findOne('org-1', 'user-1', 'lead-1'),
      ).rejects.toThrow(NotFoundException);
      expect(mockI18nService.t).toHaveBeenCalledWith('leads.ERRORS.NOT_FOUND');
    });

    it('throws Forbidden when lead exists in org but is outside scoped access', async () => {
      mockPermissionsService.getEffectivePermissions.mockResolvedValueOnce([
        AppPermission.LEADS_READ,
      ]);
      mockPrismaService.lead.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'lead-1' });

      await expect(
        service.findOne('org-1', 'user-1', 'lead-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockI18nService.t).toHaveBeenCalledWith(
        'leads.ERRORS.ACCESS_FORBIDDEN',
      );
    });

    it('throws NotFound when scoped caller cannot access and lead does not exist in org', async () => {
      mockPermissionsService.getEffectivePermissions.mockResolvedValueOnce([
        'chat:read',
      ]);
      mockPrismaService.lead.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await expect(
        service.findOne('org-1', 'user-1', 'lead-1'),
      ).rejects.toThrow(NotFoundException);
      expect(mockI18nService.t).toHaveBeenCalledWith('leads.ERRORS.NOT_FOUND');
    });
  });

  describe('update', () => {
    it('returns current lead for empty update payload when lead exists', async () => {
      const existing = { id: 'lead-1' };
      mockPrismaService.lead.findFirst.mockResolvedValueOnce(existing);

      const dto: UpdateLeadDto = {};
      const result = await service.update('org-1', 'lead-1', dto);

      expect(mockPrismaService.lead.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual(existing);
    });

    it('throws NotFound for empty update payload when lead does not exist', async () => {
      mockPrismaService.lead.findFirst.mockResolvedValueOnce(null);

      const dto: UpdateLeadDto = {};
      await expect(service.update('org-1', 'lead-1', dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockI18nService.t).toHaveBeenCalledWith('leads.ERRORS.NOT_FOUND');
    });

    it('throws NotFound when updateMany affects zero rows', async () => {
      mockPrismaService.lead.updateMany.mockResolvedValueOnce({ count: 0 });

      const dto: UpdateLeadDto = { first_name: 'Updated' };
      await expect(service.update('org-1', 'lead-1', dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockI18nService.t).toHaveBeenCalledWith('leads.ERRORS.NOT_FOUND');
    });

    it('throws NotFound when updated lead cannot be fetched', async () => {
      mockPrismaService.lead.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrismaService.lead.findFirst.mockResolvedValueOnce(null);

      const dto: UpdateLeadDto = { first_name: 'Updated' };
      await expect(service.update('org-1', 'lead-1', dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockI18nService.t).toHaveBeenCalledWith('leads.ERRORS.NOT_FOUND');
    });

    it('updates lead successfully with nullable date conversions', async () => {
      const updatedLead = { id: 'lead-1', first_name: 'Updated' };
      mockPrismaService.lead.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrismaService.lead.findFirst.mockResolvedValueOnce(updatedLead);

      const dto: UpdateLeadDto = {
        first_name: 'Updated',
        expected_service_date: '2026-06-01T10:00:00.000Z',
        next_follow_up_at: null,
      };

      const result = await service.update('org-1', 'lead-1', dto);

      const updateCalls = mockPrismaService.lead.updateMany.mock.calls as Array<
        [
          {
            where: {
              id: string;
            };
            data: {
              first_name?: string;
              expected_service_date?: Date | null;
              next_follow_up_at?: Date | null;
            };
          },
        ]
      >;
      const updatePayload = updateCalls[0]?.[0];

      expect(updatePayload).toBeDefined();
      if (!updatePayload) {
        throw new Error('Expected lead.updateMany payload');
      }

      expect(updatePayload.where).toEqual({
        id: 'lead-1',
      });
      expect(updatePayload.data.first_name).toBe('Updated');
      expect(updatePayload.data.expected_service_date).toEqual(
        new Date('2026-06-01T10:00:00.000Z'),
      );
      expect(updatePayload.data.next_follow_up_at).toBeNull();
      expect(result).toEqual(updatedLead);
    });

    it('bubbles up Prisma P2025-like errors during updateMany', async () => {
      const prismaLikeError = Object.assign(new Error('Record not found'), {
        code: 'P2025',
      });
      mockPrismaService.lead.updateMany.mockRejectedValueOnce(prismaLikeError);

      const dto: UpdateLeadDto = { first_name: 'Updated' };
      await expect(service.update('org-1', 'lead-1', dto)).rejects.toBe(
        prismaLikeError,
      );
    });
  });

  describe('bulkUpdate', () => {
    it('throws BadRequest when update_data has no defined properties', async () => {
      const dto: BulkUpdateLeadsDto = {
        lead_ids: ['11111111-1111-4111-8111-111111111111'],
        update_data: {} as BulkUpdateLeadDataDto,
      };

      await expect(service.bulkUpdate('org-1', 'user-1', dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockI18nService.t).toHaveBeenCalledWith(
        'leads.ERRORS.BAD_REQUEST',
      );
      expect(mockPrismaService.lead.updateMany).not.toHaveBeenCalled();
    });

    it('supports empty lead_ids array and returns updated_count for edit-all users', async () => {
      mockPermissionsService.getEffectivePermissions.mockResolvedValueOnce([
        AppPermission.LEADS_EDIT_ALL,
      ]);
      mockPrismaService.lead.updateMany.mockResolvedValueOnce({ count: 0 });

      const dto: BulkUpdateLeadsDto = {
        lead_ids: [],
        update_data: { status: LeadStatus.WON },
      };

      const result = await service.bulkUpdate('org-1', 'user-1', dto);

      expect(mockPrismaService.lead.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: [] },
        },
        data: { status: LeadStatus.WON },
      });
      expect(result).toEqual({ updated_count: 0 });
    });

    it('scopes bulk update to assigned agent when caller lacks edit-all', async () => {
      mockPermissionsService.getEffectivePermissions.mockResolvedValueOnce([
        AppPermission.LEADS_EDIT,
      ]);
      mockPrismaService.lead.updateMany.mockResolvedValueOnce({ count: 2 });

      const dto: BulkUpdateLeadsDto = {
        lead_ids: [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
        ],
        update_data: { priority: Priority.HOT },
      };

      const result = await service.bulkUpdate('org-1', 'user-1', dto);

      expect(mockPrismaService.lead.updateMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: [
              '11111111-1111-4111-8111-111111111111',
              '22222222-2222-4222-8222-222222222222',
            ],
          },
          assigned_agent_id: 'user-1',
        },
        data: { priority: Priority.HOT },
      });
      expect(result).toEqual({ updated_count: 2 });
    });

    it('bubbles up Prisma P2025-like errors during bulk update', async () => {
      const prismaLikeError = Object.assign(new Error('Record not found'), {
        code: 'P2025',
      });
      mockPermissionsService.getEffectivePermissions.mockResolvedValueOnce([
        AppPermission.LEADS_EDIT_ALL,
      ]);
      mockPrismaService.lead.updateMany.mockRejectedValueOnce(prismaLikeError);

      const dto: BulkUpdateLeadsDto = {
        lead_ids: ['11111111-1111-4111-8111-111111111111'],
        update_data: { status: LeadStatus.OPEN },
      };

      await expect(service.bulkUpdate('org-1', 'user-1', dto)).rejects.toBe(
        prismaLikeError,
      );
    });
  });

  describe('remove', () => {
    it('deletes lead within organization scope', async () => {
      mockPrismaService.lead.deleteMany.mockResolvedValueOnce({ count: 1 });

      await service.remove('org-1', 'lead-1');

      expect(mockPrismaService.lead.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'lead-1',
        },
      });
    });

    it('throws NotFound when no scoped record is deleted', async () => {
      mockPrismaService.lead.deleteMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.remove('org-1', 'lead-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockI18nService.t).toHaveBeenCalledWith('leads.ERRORS.NOT_FOUND');
    });

    it('bubbles up Prisma P2025-like errors during delete', async () => {
      const prismaLikeError = Object.assign(new Error('Record not found'), {
        code: 'P2025',
      });
      mockPrismaService.lead.deleteMany.mockRejectedValueOnce(prismaLikeError);

      await expect(service.remove('org-1', 'lead-1')).rejects.toBe(
        prismaLikeError,
      );
    });
  });

  describe('private helper branches', () => {
    it('covers toNullableDate branches', () => {
      const privateApi = service as unknown as ServicePrivates;

      expect(privateApi.toNullableDate(undefined)).toBeUndefined();
      expect(privateApi.toNullableDate(null)).toBeNull();
      expect(privateApi.toNullableDate('2026-01-01T00:00:00.000Z')).toEqual(
        new Date('2026-01-01T00:00:00.000Z'),
      );
      expect(privateApi.toNullableDate('')).toBeNull();
    });

    it('covers pickDefined helper branch', () => {
      const privateApi = service as unknown as ServicePrivates;

      expect(
        privateApi.pickDefined({
          first_name: 'John',
          last_name: undefined,
          city: null,
        }),
      ).toEqual({ first_name: 'John', city: null });
    });

    it('covers hasPermission exact and negative branches', () => {
      const privateApi = service as unknown as ServicePrivates;

      expect(
        privateApi.hasPermission(['leads:read_all'], 'leads:read_all'),
      ).toBe(true);
      expect(privateApi.hasPermission(['users:*'], 'leads:read_all')).toBe(
        false,
      );
    });
  });
});
