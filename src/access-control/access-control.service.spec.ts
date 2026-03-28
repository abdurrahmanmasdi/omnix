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
import { AccessControlService } from './access-control.service';

describe('AccessControlService', () => {
  let service: AccessControlService;

  const mockPrismaService = {
    organizationMembership: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    rolePermission: {
      findMany: jest.fn(),
    },
    membershipPermissionOverride: {
      upsert: jest.fn(),
    },
    permission: {
      findFirst: jest.fn(),
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

  const ownerCaller = {
    id: 'membership-owner',
    role: { slug: 'owner' as string | null },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessControlService,
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
      ],
    }).compile();

    service = module.get<AccessControlService>(AccessControlService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('deleteRole', () => {
    const organizationId = 'org-1';
    const roleId = 'role-1';
    const userId = 'user-1';

    it('throws ForbiddenException when caller is not in organization', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
        null,
      );

      await expect(
        service.deleteRole(organizationId, roleId, userId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when role does not exist', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'm1',
      });
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
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'm1',
      });
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
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'm1',
      });
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
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'm1',
      });
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

  describe('changeMemberRole', () => {
    const orgId = 'org-2';
    const membershipId = 'membership-2';
    const newRoleId = 'role-2';
    const ownerId = 'owner-1';
    const managerId = 'manager-1';

    it('throws ForbiddenException when caller is not owner', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'm-manager',
        role: { slug: 'manager' as string | null },
      });

      await expect(
        service.changeMemberRole(orgId, membershipId, newRoleId, managerId),
      ).rejects.toThrow(ForbiddenException);

      expect(
        mockPrismaService.organizationMembership.findFirst,
      ).toHaveBeenCalledWith({
        where: {
          organization_id: orgId,
          user_id: managerId,
          status: MembershipStatus.ACTIVE,
        },
        include: {
          role: {
            select: { slug: true },
          },
        },
      });
    });

    it('throws BadRequestException when target membership has owner role', async () => {
      mockPrismaService.organizationMembership.findFirst
        .mockResolvedValueOnce(ownerCaller)
        .mockResolvedValueOnce({
          id: membershipId,
          user_id: 'target-user',
          role: { slug: 'owner' as string | null },
        });

      await expect(
        service.changeMemberRole(orgId, membershipId, newRoleId, ownerId),
      ).rejects.toThrow(BadRequestException);

      expect(mockI18nService.t).toHaveBeenCalledWith(
        'errors.CANNOT_MODIFY_OWNER_ROLE',
      );
    });

    it('throws NotFoundException when target membership does not exist', async () => {
      mockPrismaService.organizationMembership.findFirst
        .mockResolvedValueOnce(ownerCaller)
        .mockResolvedValueOnce(null);

      await expect(
        service.changeMemberRole(orgId, membershipId, newRoleId, ownerId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when new role does not exist', async () => {
      mockPrismaService.organizationMembership.findFirst
        .mockResolvedValueOnce(ownerCaller)
        .mockResolvedValueOnce({
          id: membershipId,
          user_id: 'target-user',
          role: { slug: 'agent' as string | null },
        });
      mockPrismaService.role.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.changeMemberRole(orgId, membershipId, newRoleId, ownerId),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates membership role and emits cache clear event on success', async () => {
      mockPrismaService.organizationMembership.findFirst
        .mockResolvedValueOnce(ownerCaller)
        .mockResolvedValueOnce({
          id: membershipId,
          user_id: 'target-user',
          role: { slug: 'agent' as string | null },
        });
      mockPrismaService.role.findFirst.mockResolvedValueOnce({ id: newRoleId });
      mockPrismaService.organizationMembership.update.mockResolvedValueOnce({
        id: membershipId,
        role_id: newRoleId,
      });

      const result = await service.changeMemberRole(
        orgId,
        membershipId,
        newRoleId,
        ownerId,
      );

      expect(result.role_id).toBe(newRoleId);
      expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
        'permissions.cache.clear-user',
        {
          userId: 'target-user',
          organizationId: orgId,
        },
      );
    });
  });

  describe('assignPermissionOverride', () => {
    const orgId = 'org-3';
    const membershipId = 'membership-3';
    const permissionId = 'permission-1';
    const ownerId = 'owner-2';
    const managerId = 'manager-2';

    it('throws ForbiddenException when caller is not owner', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'm-manager',
        role: { slug: 'manager' as string | null },
      });

      await expect(
        service.assignPermissionOverride(
          orgId,
          membershipId,
          permissionId,
          true,
          managerId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when trying to override owner permissions', async () => {
      mockPrismaService.organizationMembership.findFirst
        .mockResolvedValueOnce(ownerCaller)
        .mockResolvedValueOnce({
          id: membershipId,
          user_id: 'target-user',
          role: { slug: 'owner' as string | null },
        });

      await expect(
        service.assignPermissionOverride(
          orgId,
          membershipId,
          permissionId,
          true,
          ownerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when permission does not exist', async () => {
      mockPrismaService.organizationMembership.findFirst
        .mockResolvedValueOnce(ownerCaller)
        .mockResolvedValueOnce({
          id: membershipId,
          user_id: 'target-user',
          role: { slug: 'agent' as string | null },
        });
      mockPrismaService.permission.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.assignPermissionOverride(
          orgId,
          membershipId,
          permissionId,
          true,
          ownerId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('upserts override and emits cache clear event', async () => {
      mockPrismaService.organizationMembership.findFirst
        .mockResolvedValueOnce(ownerCaller)
        .mockResolvedValueOnce({
          id: membershipId,
          user_id: 'target-user',
          role: { slug: 'agent' as string | null },
        });
      mockPrismaService.permission.findFirst.mockResolvedValueOnce({
        id: permissionId,
      });
      mockPrismaService.membershipPermissionOverride.upsert.mockResolvedValueOnce(
        {
          id: 'override-1',
          permission_id: permissionId,
          is_granted: true,
        },
      );

      const result = await service.assignPermissionOverride(
        orgId,
        membershipId,
        permissionId,
        true,
        ownerId,
      );

      expect(result.is_granted).toBe(true);
      expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
        'permissions.cache.clear-user',
        {
          userId: 'target-user',
          organizationId: orgId,
        },
      );
    });
  });

  describe('updateRole', () => {
    const orgId = 'org-4';
    const roleId = 'role-4';
    const ownerId = 'owner-3';

    it('throws ForbiddenException when caller is not owner', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'm-agent',
        role: { slug: 'agent' as string | null },
      });

      await expect(
        service.updateRole(orgId, roleId, ownerId, {
          permissionIds: [],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when role is system role', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
        ownerCaller,
      );
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
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
        ownerCaller,
      );
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

      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
        ownerCaller,
      );
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

      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
        ownerCaller,
      );
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
  });
});
