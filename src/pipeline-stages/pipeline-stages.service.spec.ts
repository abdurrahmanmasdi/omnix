import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { PipelineStagesService } from './pipeline-stages.service';

describe('PipelineStagesService', () => {
  let service: PipelineStagesService;

  const mockPrismaService = {
    pipelineStage: {
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
        PipelineStagesService,
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

    service = module.get<PipelineStagesService>(PipelineStagesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('queries only organization stages ordered by order_index asc', async () => {
      const orgId = 'org-1';
      const stages = [
        { id: 'stage-1', organization_id: orgId, order_index: 1 },
      ];
      mockPrismaService.pipelineStage.findMany.mockResolvedValueOnce(stages);

      const result = await service.findAll(orgId);

      expect(mockPrismaService.pipelineStage.findMany).toHaveBeenCalledWith({
        where: { organization_id: orgId },
        orderBy: { order_index: 'asc' },
      });
      expect(result).toEqual(stages);
    });
  });

  describe('update', () => {
    it('returns existing stage when update dto is empty', async () => {
      const stage = { id: 'stage-1', organization_id: 'org-1', name: 'New' };
      mockPrismaService.pipelineStage.findFirst.mockResolvedValueOnce(stage);

      const result = await service.update('org-1', 'stage-1', {});

      expect(mockPrismaService.pipelineStage.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual(stage);
    });

    it('throws NotFoundException when scoped update affects no records', async () => {
      mockPrismaService.pipelineStage.updateMany.mockResolvedValueOnce({
        count: 0,
      });

      await expect(
        service.update('org-1', 'stage-1', { name: 'Qualified' }),
      ).rejects.toThrow(NotFoundException);

      expect(mockI18nService.t).toHaveBeenCalledWith(
        'leads.ERRORS.RESOURCE_NOT_FOUND',
      );
    });
  });

  describe('remove', () => {
    it('deletes stage within organization scope', async () => {
      mockPrismaService.pipelineStage.deleteMany.mockResolvedValueOnce({
        count: 1,
      });

      await service.remove('org-1', 'stage-1');

      expect(mockPrismaService.pipelineStage.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'stage-1',
          organization_id: 'org-1',
        },
      });
    });

    it('throws NotFoundException when scoped delete finds no stage', async () => {
      mockPrismaService.pipelineStage.deleteMany.mockResolvedValueOnce({
        count: 0,
      });

      await expect(service.remove('org-1', 'stage-1')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockI18nService.t).toHaveBeenCalledWith(
        'leads.ERRORS.RESOURCE_NOT_FOUND',
      );
    });
  });
});
