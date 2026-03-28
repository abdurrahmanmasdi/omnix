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
import { PermissionOverridesService } from './permission-overrides.service';

describe('PermissionOverridesService', () => {
  let service: PermissionOverridesService;

  const mockPrismaService = {
    organizationMembership: {
      findFirst: jest.fn(),
    },
    membershipPermissionOverride: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    permission: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
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
    verifyIsOwnerOrAdmin: jest.fn(),
  };

  const ownerCaller = {
    id: 'membership-owner',
    role: { slug: 'owner' as string | null },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionOverridesService,
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

    service = module.get<PermissionOverridesService>(
      PermissionOverridesService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('assignPermissionOverride', () => {
    const orgId = 'org-3';
    const membershipId = 'membership-3';
    const permissionId = 'permission-1';
    const ownerId = 'owner-2';

    it('throws ForbiddenException when caller is not owner', async () => {
      mockAccessVerificationService.verifyIsOwner.mockRejectedValueOnce(
        new ForbiddenException('errors.ONLY_OWNER_CAN_PERFORM_THIS_ACTION'),
      );

      await expect(
        service.assignPermissionOverride(
          orgId,
          membershipId,
          permissionId,
          true,
          ownerId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when trying to override owner permissions', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
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
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
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
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
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

  describe('createPermissionOverride', () => {
    it('throws ForbiddenException when caller is not owner/admin', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockRejectedValueOnce(
        new ForbiddenException('errors.INSUFFICIENT_PERMISSIONS'),
      );

      await expect(
        service.createPermissionOverride('org', 'membership', 'user', {
          permission_id: 'perm',
          is_granted: true,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when membership does not exist', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
        null,
      );

      await expect(
        service.createPermissionOverride('org', 'membership', 'user', {
          permission_id: 'perm',
          is_granted: true,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMemberPermissionBreakdown', () => {
    it('returns role and override ids', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'membership',
        role: {
          rolePermissions: [{ permission_id: 'perm-1' }],
        },
      });
      mockPrismaService.membershipPermissionOverride.findMany.mockResolvedValueOnce(
        [{ permission_id: 'perm-2' }],
      );

      const result = await service.getMemberPermissionBreakdown(
        'org',
        'membership',
        ownerCaller.id,
      );

      expect(result).toEqual({
        rolePermissionIds: ['perm-1'],
        grantedOverrideIds: ['perm-2'],
      });
    });
  });
});
