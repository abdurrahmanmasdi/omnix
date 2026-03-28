import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { AccessVerificationService } from './access-verification.service';
import { RolesService } from './roles.service';

describe('RolesService (Branches)', () => {
  let service: RolesService;

  const mockPrismaService = {
    role: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    rolePermission: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    permission: {
      findMany: jest.fn(),
    },
    organizationMembership: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockI18nService = {
    t: jest.fn((key: string) => key),
  };

  const mockEventEmitter = {
    emitAsync: jest.fn().mockResolvedValue([]),
  };

  const mockAccessVerificationService = {
    verifyUserInOrganization: jest.fn(),
    verifyIsOwner: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: I18nService,
          useValue: mockI18nService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: AccessVerificationService,
          useValue: mockAccessVerificationService,
        },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRoles', () => {
    it('passes through ForbiddenException when caller is outside organization', async () => {
      mockAccessVerificationService.verifyUserInOrganization.mockRejectedValueOnce(
        new ForbiddenException('errors.UNAUTHORIZED_ACCESS'),
      );

      await expect(service.getRoles('org-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns roles for authorized member', async () => {
      mockAccessVerificationService.verifyUserInOrganization.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.role.findMany.mockResolvedValueOnce([
        {
          id: 'r1',
          name: 'agent',
          is_system: false,
          organization_id: 'org-1',
          created_at: new Date(),
          rolePermissions: [],
        },
      ]);

      const result = await service.getRoles('org-1', 'user-1');

      expect(result).toHaveLength(1);
      expect(mockPrismaService.role.findMany).toHaveBeenCalled();
    });
  });

  describe('createRole', () => {
    const dto = {
      name: 'custom-role',
      permissionIds: ['p1', 'p2'],
      name_translations: { en: 'Custom Role' },
    };

    it('throws BadRequestException when permission list includes invalid ids', async () => {
      mockAccessVerificationService.verifyUserInOrganization.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.permission.findMany.mockResolvedValueOnce([
        { id: 'p1' },
      ]);

      await expect(service.createRole('org-1', 'user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates role in transaction with batched rolePermissions', async () => {
      mockAccessVerificationService.verifyUserInOrganization.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.permission.findMany.mockResolvedValueOnce([
        { id: 'p1' },
        { id: 'p2' },
      ]);

      const txRoleCreate = jest.fn().mockResolvedValue({ id: 'role-created' });
      const txRolePermissionCreateMany = jest
        .fn()
        .mockResolvedValue({ count: 2 });
      const txRoleFindUnique = jest.fn().mockResolvedValue({
        id: 'role-created',
        name: 'custom-role',
        is_system: false,
        organization_id: 'org-1',
        created_at: new Date(),
        rolePermissions: [],
      });

      mockPrismaService.$transaction.mockImplementationOnce(
        async (
          callback: (tx: {
            role: {
              create: typeof txRoleCreate;
              findUnique: typeof txRoleFindUnique;
            };
            rolePermission: {
              createMany: typeof txRolePermissionCreateMany;
            };
          }) => Promise<unknown>,
        ) =>
          callback({
            role: {
              create: txRoleCreate,
              findUnique: txRoleFindUnique,
            },
            rolePermission: {
              createMany: txRolePermissionCreateMany,
            },
          }),
      );

      const result = await service.createRole('org-1', 'user-1', dto);

      expect(txRoleCreate).toHaveBeenCalled();
      expect(txRolePermissionCreateMany).toHaveBeenCalledWith({
        data: [
          { role_id: 'role-created', permission_id: 'p1' },
          { role_id: 'role-created', permission_id: 'p2' },
        ],
        skipDuplicates: true,
      });
      expect(result.id).toBe('role-created');
    });
  });

  describe('updateRole', () => {
    it('throws NotFoundException for cross-tenant role update attempts', async () => {
      mockAccessVerificationService.verifyIsOwner.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.role.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateRole('org-1', 'role-from-other-org', 'owner-1', {
          name: 'new-name',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
