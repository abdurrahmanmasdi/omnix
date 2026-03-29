import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MembershipStatus } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationsService } from './organizations.service';
import { OrganizationProvisioningService } from './services/organization-provisioning.service';

describe('OrganizationsService (Branches)', () => {
  let service: OrganizationsService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    organization: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    organizationMembership: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    permission: {
      findMany: jest.fn(),
    },
    role: {
      create: jest.fn(),
    },
    rolePermission: {
      createMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockI18n = {
    t: jest.fn((key: string) => key),
  };

  const mockEventEmitter = {
    emitAsync: jest.fn().mockResolvedValue([]),
  };

  const mockProvisioningService = {
    provisionDefaultTenantRBAC: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: I18nService,
          useValue: mockI18n,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: OrganizationProvisioningService,
          useValue: mockProvisioningService,
        },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  describe('create', () => {
    const dto = { name: 'Org', slug: 'org-alpha', is_public: true };

    it('throws NotFoundException when creator user does not exist', async () => {
      mockPrismaService.$transaction.mockImplementationOnce(
        async (callback: (tx: typeof mockPrismaService) => Promise<unknown>) =>
          callback(mockPrismaService),
      );
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.create('user-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when slug already exists', async () => {
      mockPrismaService.$transaction.mockImplementationOnce(
        async (callback: (tx: typeof mockPrismaService) => Promise<unknown>) =>
          callback(mockPrismaService),
      );
      mockPrismaService.user.findUnique.mockResolvedValueOnce({ id: 'user-1' });
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'existing-org',
      });

      await expect(service.create('user-1', dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('maps unexpected transaction errors to InternalServerErrorException', async () => {
      mockPrismaService.$transaction.mockRejectedValueOnce(
        new Error('db down'),
      );

      await expect(service.create('user-1', dto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findBySlug', () => {
    it('throws NotFoundException when slug is not found', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValueOnce(null);

      await expect(service.findBySlug('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('maps unexpected errors to InternalServerErrorException', async () => {
      mockPrismaService.organization.findUnique.mockRejectedValueOnce(
        new Error('query fail'),
      );

      await expect(service.findBySlug('alpha')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('update', () => {
    it('passes through NotFoundException when target org does not exist', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.update('missing-org', { name: 'new' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps update persistence errors to InternalServerErrorException', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
        name: 'Org',
        slug: 'org',
        is_public: true,
        created_at: new Date(),
      });
      mockPrismaService.organization.update.mockRejectedValueOnce(
        new Error('update fail'),
      );

      await expect(service.update('org-1', { name: 'new' })).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('remove', () => {
    it('completes without cache events when no memberships are affected', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
        name: 'Org',
        slug: 'org',
        is_public: true,
        created_at: new Date(),
      });
      mockPrismaService.$transaction.mockImplementationOnce(
        async (
          callback: (tx: {
            organizationMembership: {
              findMany: typeof mockPrismaService.organizationMembership.findMany;
              updateMany: typeof mockPrismaService.organizationMembership.updateMany;
            };
          }) => Promise<unknown>,
        ) =>
          callback({
            organizationMembership: {
              findMany: mockPrismaService.organizationMembership.findMany,
              updateMany: mockPrismaService.organizationMembership.updateMany,
            },
          }),
      );
      mockPrismaService.organizationMembership.findMany.mockResolvedValueOnce(
        [],
      );

      await service.remove('org-1');

      expect(
        mockPrismaService.organizationMembership.updateMany,
      ).toHaveBeenCalledWith({
        where: { organization_id: 'org-1' },
        data: { status: MembershipStatus.REJECTED },
      });
      expect(mockEventEmitter.emitAsync).not.toHaveBeenCalled();
    });
  });
});
