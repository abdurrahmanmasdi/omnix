import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { I18nService } from 'nestjs-i18n';
import { MembershipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessVerificationService } from './access-verification.service';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  let service: RolesService;

  const mockPrismaService = {
    organizationMembership: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    rolePermission: {
      findMany: jest.fn(),
    },
    permission: {
      findMany: jest.fn(),
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

  describe('deleteRole', () => {
    const organizationId = 'org-1';
    const roleId = 'role-1';
    const userId = 'user-1';

    it('throws ForbiddenException when caller is not in organization', async () => {
      mockAccessVerificationService.verifyUserInOrganization.mockRejectedValueOnce(
        new ForbiddenException('errors.UNAUTHORIZED_ACCESS'),
      );

      await expect(
        service.deleteRole(organizationId, roleId, userId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when role does not exist', async () => {
      mockPrismaService.role.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.deleteRole(organizationId, roleId, userId),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.role.findFirst).toHaveBeenCalledWith({
        where: {
          id: roleId,
          organization_id: organizationId,
        },
        select: { id: true, is_system: true },
      });
    });

    it('throws ForbiddenException when role is system role', async () => {
      mockPrismaService.role.findFirst.mockResolvedValueOnce({
        id: roleId,
        is_system: true,
        slug: 'owner',
      });

      await expect(
        service.deleteRole(organizationId, roleId, userId),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.role.delete).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when role has active members', async () => {
      mockPrismaService.role.findFirst.mockResolvedValueOnce({
        id: roleId,
        is_system: false,
        slug: null,
      });
      mockPrismaService.organizationMembership.count.mockResolvedValueOnce(2);

      await expect(
        service.deleteRole(organizationId, roleId, userId),
      ).rejects.toThrow(BadRequestException);

      expect(mockI18nService.t).toHaveBeenCalledWith(
        'errors.CANNOT_DELETE_ROLE_WITH_MEMBERS',
      );
    });

    it('deletes custom role when no active members', async () => {
      mockPrismaService.role.findFirst.mockResolvedValueOnce({
        id: roleId,
        is_system: false,
        slug: null,
      });
      mockPrismaService.organizationMembership.count.mockResolvedValueOnce(0);
      mockPrismaService.role.delete.mockResolvedValueOnce({ id: roleId });

      const result = await service.deleteRole(organizationId, roleId, userId);

      expect(result).toEqual({
        message: 'messages.ROLE_DELETED_SUCCESSFULLY',
      });
      expect(mockPrismaService.role.delete).toHaveBeenCalledWith({
        where: { id: roleId },
      });
    });
  });

  describe('updateRole', () => {
    const orgId = 'org-4';
    const roleId = 'role-4';
    const ownerId = 'owner-3';

    it('throws ForbiddenException when caller is not owner', async () => {
      mockAccessVerificationService.verifyIsOwner.mockRejectedValueOnce(
        new ForbiddenException('errors.ONLY_OWNER_CAN_PERFORM_THIS_ACTION'),
      );

      await expect(
        service.updateRole(orgId, roleId, ownerId, {
          permissionIds: [],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when role is system role', async () => {
      mockPrismaService.role.findFirst.mockResolvedValueOnce({
        id: roleId,
        is_system: true,
        slug: 'owner' as string | null,
      });

      await expect(
        service.updateRole(orgId, roleId, ownerId, {
          permissionIds: [],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when permission IDs are invalid', async () => {
      mockPrismaService.role.findFirst.mockResolvedValueOnce({
        id: roleId,
        is_system: false,
      });
      mockPrismaService.permission.findMany.mockResolvedValueOnce([
        { id: 'p1' },
      ]);

      await expect(
        service.updateRole(orgId, roleId, ownerId, {
          permissionIds: ['p1', 'p2'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses batch deleteMany and createMany in full replacement mode', async () => {
      const pKeep = 'permission-keep';
      const pRemove = 'permission-remove';
      const pAdd = 'permission-add';

      mockPrismaService.role.findFirst.mockResolvedValueOnce({
        id: roleId,
        is_system: false,
      });
      mockPrismaService.permission.findMany.mockResolvedValueOnce([
        { id: pKeep },
        { id: pAdd },
      ]);
      mockPrismaService.rolePermission.findMany.mockResolvedValueOnce([
        { permission_id: pKeep },
        { permission_id: pRemove },
      ]);

      const txDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
      const txCreateMany = jest.fn().mockResolvedValue({ count: 1 });
      const txRoleUpdate = jest.fn().mockResolvedValue({
        id: roleId,
        name: 'Updated',
        is_system: false,
        rolePermissions: [],
      });

      mockPrismaService.$transaction.mockImplementationOnce(
        async (
          cb: (tx: {
            rolePermission: {
              deleteMany: typeof txDeleteMany;
              createMany: typeof txCreateMany;
            };
            role: {
              update: typeof txRoleUpdate;
            };
          }) => Promise<unknown>,
        ) =>
          cb({
            rolePermission: {
              deleteMany: txDeleteMany,
              createMany: txCreateMany,
            },
            role: {
              update: txRoleUpdate,
            },
          }),
      );

      mockPrismaService.organizationMembership.findMany.mockResolvedValueOnce([
        { user_id: 'u1' },
        { user_id: 'u2' },
      ]);

      const result = await service.updateRole(orgId, roleId, ownerId, {
        name: 'Updated',
        permissionIds: [pKeep, pAdd],
      });

      expect(result.name).toBe('Updated');
      expect(txDeleteMany).toHaveBeenCalledWith({
        where: {
          role_id: roleId,
          permission_id: { in: [pRemove] },
        },
      });
      expect(txCreateMany).toHaveBeenCalledWith({
        data: [
          {
            role_id: roleId,
            permission_id: pAdd,
          },
        ],
        skipDuplicates: true,
      });
      expect(mockEventEmitter.emitAsync).toHaveBeenCalledTimes(2);
    });

    it('uses batch deleteMany and createMany in incremental mode', async () => {
      const pRemove = 'permission-remove-2';
      const pAdd = 'permission-add-2';

      mockPrismaService.role.findFirst.mockResolvedValueOnce({
        id: roleId,
        is_system: false,
      });
      mockPrismaService.permission.findMany.mockResolvedValueOnce([
        { id: pRemove },
        { id: pAdd },
      ]);

      const txDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
      const txCreateMany = jest.fn().mockResolvedValue({ count: 1 });
      const txRoleUpdate = jest.fn().mockResolvedValue({
        id: roleId,
        name: 'Incremental',
        is_system: false,
        rolePermissions: [],
      });

      mockPrismaService.$transaction.mockImplementationOnce(
        async (
          cb: (tx: {
            rolePermission: {
              deleteMany: typeof txDeleteMany;
              createMany: typeof txCreateMany;
            };
            role: {
              update: typeof txRoleUpdate;
            };
          }) => Promise<unknown>,
        ) =>
          cb({
            rolePermission: {
              deleteMany: txDeleteMany,
              createMany: txCreateMany,
            },
            role: {
              update: txRoleUpdate,
            },
          }),
      );

      mockPrismaService.organizationMembership.findMany.mockResolvedValueOnce([
        { user_id: 'u3' },
      ]);

      await service.updateRole(orgId, roleId, ownerId, {
        name: 'Incremental',
        permissionsToRemove: [pRemove],
        permissionsToAdd: [pAdd],
      });

      expect(mockPrismaService.rolePermission.findMany).not.toHaveBeenCalled();
      expect(txDeleteMany).toHaveBeenCalledWith({
        where: {
          role_id: roleId,
          permission_id: { in: [pRemove] },
        },
      });
      expect(txCreateMany).toHaveBeenCalledWith({
        data: [
          {
            role_id: roleId,
            permission_id: pAdd,
          },
        ],
        skipDuplicates: true,
      });
      expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
        'permissions.cache.clear-user',
        {
          userId: 'u3',
          organizationId: orgId,
        },
      );
    });

    it('does not emit cache clear when permissions are unchanged', async () => {
      mockPrismaService.role.findFirst.mockResolvedValueOnce({
        id: roleId,
        is_system: false,
      });

      const txRoleUpdate = jest.fn().mockResolvedValue({
        id: roleId,
        name: 'Name-only',
        is_system: false,
        rolePermissions: [],
      });

      mockPrismaService.$transaction.mockImplementationOnce(
        async (
          cb: (tx: {
            rolePermission: {
              deleteMany: jest.Mock;
              createMany: jest.Mock;
            };
            role: {
              update: typeof txRoleUpdate;
            };
          }) => Promise<unknown>,
        ) =>
          cb({
            rolePermission: {
              deleteMany: jest.fn(),
              createMany: jest.fn(),
            },
            role: {
              update: txRoleUpdate,
            },
          }),
      );

      await service.updateRole(orgId, roleId, ownerId, {
        name: 'Name-only',
      });

      expect(
        mockPrismaService.organizationMembership.findMany,
      ).not.toHaveBeenCalled();
      expect(mockEventEmitter.emitAsync).not.toHaveBeenCalled();
    });

    it('queries active memberships when invalidating cache', async () => {
      mockPrismaService.role.findFirst.mockResolvedValueOnce({
        id: roleId,
        is_system: false,
      });
      mockPrismaService.permission.findMany.mockResolvedValueOnce([
        { id: 'pA' },
      ]);
      mockPrismaService.rolePermission.findMany.mockResolvedValueOnce([]);

      const txRoleUpdate = jest.fn().mockResolvedValue({
        id: roleId,
        name: 'Updated',
        is_system: false,
        rolePermissions: [],
      });

      mockPrismaService.$transaction.mockImplementationOnce(
        async (
          cb: (tx: {
            rolePermission: {
              deleteMany: jest.Mock;
              createMany: jest.Mock;
            };
            role: {
              update: typeof txRoleUpdate;
            };
          }) => Promise<unknown>,
        ) =>
          cb({
            rolePermission: {
              deleteMany: jest.fn(),
              createMany: jest.fn(),
            },
            role: {
              update: txRoleUpdate,
            },
          }),
      );

      mockPrismaService.organizationMembership.findMany.mockResolvedValueOnce(
        [],
      );

      await service.updateRole(orgId, roleId, ownerId, {
        permissionIds: ['pA'],
      });

      expect(
        mockPrismaService.organizationMembership.findMany,
      ).toHaveBeenCalledWith({
        where: {
          organization_id: orgId,
          role_id: roleId,
          status: MembershipStatus.ACTIVE,
        },
        select: {
          user_id: true,
        },
      });
    });
  });
});
