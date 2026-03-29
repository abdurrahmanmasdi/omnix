import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { LeadSourcesService } from './lead-sources.service';

describe('LeadSourcesService', () => {
  let service: LeadSourcesService;

  const mockPrismaService = {
    leadSource: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockI18nService = {
    t: jest.fn((key: string) => key),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadSourcesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: I18nService,
          useValue: mockI18nService,
        },
      ],
    }).compile();

    service = module.get<LeadSourcesService>(LeadSourcesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('queries only organization lead sources', async () => {
      const orgId = 'org-1';
      const sources = [{ id: 'source-1', organization_id: orgId }];
      mockPrismaService.leadSource.findMany.mockResolvedValueOnce(sources);

      const result = await service.findAll(orgId);

      expect(mockPrismaService.leadSource.findMany).toHaveBeenCalledWith({
        where: { organization_id: orgId },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual(sources);
    });

    it('filters only active sources when activeOnly=true', async () => {
      const orgId = 'org-1';
      mockPrismaService.leadSource.findMany.mockResolvedValueOnce([]);

      await service.findAll(orgId, true);

      expect(mockPrismaService.leadSource.findMany).toHaveBeenCalledWith({
        where: { organization_id: orgId, is_active: true },
        orderBy: { created_at: 'desc' },
      });
    });
  });

  describe('update', () => {
    it('returns existing source when update dto is empty', async () => {
      const source = { id: 'source-1', organization_id: 'org-1', name: 'Ads' };
      mockPrismaService.leadSource.findFirst.mockResolvedValueOnce(source);

      const result = await service.update('org-1', 'source-1', {});

      expect(mockPrismaService.leadSource.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual(source);
    });

    it('throws NotFoundException when scoped update affects no records', async () => {
      mockPrismaService.leadSource.updateMany.mockResolvedValueOnce({
        count: 0,
      });

      await expect(
        service.update('org-1', 'source-1', { name: 'Referral' }),
      ).rejects.toThrow(NotFoundException);

      expect(mockI18nService.t).toHaveBeenCalledWith('leads.ERRORS.RESOURCE_NOT_FOUND');
    });
  });

  describe('remove', () => {
    it('deletes source within organization scope', async () => {
      mockPrismaService.leadSource.deleteMany.mockResolvedValueOnce({
        count: 1,
      });

      await service.remove('org-1', 'source-1');

      expect(mockPrismaService.leadSource.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'source-1',
          organization_id: 'org-1',
        },
      });
    });

    it('throws NotFoundException when scoped delete finds no source', async () => {
      mockPrismaService.leadSource.deleteMany.mockResolvedValueOnce({
        count: 0,
      });

      await expect(service.remove('org-1', 'source-1')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockI18nService.t).toHaveBeenCalledWith('leads.ERRORS.RESOURCE_NOT_FOUND');
    });
  });
});
