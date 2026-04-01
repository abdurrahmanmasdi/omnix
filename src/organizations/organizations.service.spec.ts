import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationsService } from './organizations.service';
import { MembershipStatus } from '@prisma/client';
import { OrganizationProvisioningService } from './services/organization-provisioning.service';
import { RequestContextService } from '../request-context/request-context.service';

describe('OrganizationsService', () => {
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

  const mockRequestContextService = {
    runWithBypass: jest.fn(async (callback: () => Promise<unknown>) =>
      callback(),
    ),
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
        {
          provide: RequestContextService,
          useValue: mockRequestContextService,
        },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw NotFoundException when findById target does not exist', async () => {
    mockPrismaService.organization.findUnique.mockResolvedValue(null);

    await expect(service.findById('org-missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw BadRequestException when pagination is invalid', async () => {
    await expect(service.findAllPublic(-1, 10)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw ConflictException when update slug is already used', async () => {
    mockPrismaService.organization.findUnique
      .mockResolvedValueOnce({
        id: 'org1',
        name: 'Org',
        slug: 'old-slug',
        is_public: true,
        created_at: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'org2',
        slug: 'new-slug',
      });

    await expect(service.update('org1', { slug: 'new-slug' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('should deactivate memberships and emit cache clear event on remove', async () => {
    mockPrismaService.organization.findUnique.mockResolvedValue({
      id: 'org1',
      name: 'Org',
      slug: 'org',
      is_public: true,
      created_at: new Date(),
    });

    mockPrismaService.$transaction.mockImplementation(
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

    mockPrismaService.organizationMembership.findMany.mockResolvedValue([
      { user_id: 'u1' },
      { user_id: 'u2' },
      { user_id: 'u1' },
    ]);

    await service.remove('org1');

    expect(
      mockPrismaService.organizationMembership.updateMany,
    ).toHaveBeenCalledWith({
      where: { organization_id: 'org1' },
      data: { status: MembershipStatus.REJECTED },
    });
    expect(mockEventEmitter.emitAsync).toHaveBeenCalledTimes(2);
    expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
      'permissions.cache.clear-user',
      {
        userId: 'u1',
        organizationId: 'org1',
      },
    );
    expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
      'permissions.cache.clear-user',
      {
        userId: 'u2',
        organizationId: 'org1',
      },
    );
  });

  it('should map unexpected remove errors to InternalServerErrorException', async () => {
    mockPrismaService.organization.findUnique.mockResolvedValue({
      id: 'org1',
      name: 'Org',
      slug: 'org',
      is_public: true,
      created_at: new Date(),
    });

    mockPrismaService.$transaction.mockRejectedValue(new Error('db down'));

    await expect(service.remove('org1')).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
