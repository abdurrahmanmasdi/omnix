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

describe('PermissionOverridesService (Branches)', () => {
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

  describe('createPermissionOverride', () => {
    it('throws NotFoundException when permission does not exist', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'membership-1',
        user_id: 'user-1',
      });
      mockPrismaService.permission.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createPermissionOverride('org-1', 'membership-1', 'admin-1', {
          permission_id: 'perm-404',
          is_granted: true,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates unexpected upsert errors', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'membership-1',
        user_id: 'user-1',
      });
      mockPrismaService.permission.findFirst.mockResolvedValueOnce({
        id: 'perm-1',
      });
      mockPrismaService.membershipPermissionOverride.upsert.mockRejectedValueOnce(
        new Error('upsert failed'),
      );

      await expect(
        service.createPermissionOverride('org-1', 'membership-1', 'admin-1', {
          permission_id: 'perm-1',
          is_granted: true,
        }),
      ).rejects.toThrow('upsert failed');
    });
  });

  describe('removePermissionOverride', () => {
    it('passes through ForbiddenException when caller is unauthorized', async () => {
      mockAccessVerificationService.verifyIsOwner.mockRejectedValueOnce(
        new ForbiddenException('organizations.ERRORS.ONLY_OWNER_CAN_PERFORM_THIS_ACTION'),
      );

      await expect(
        service.removePermissionOverride(
          'org-1',
          'membership-1',
          'perm-1',
          'user-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when trying to modify owner membership overrides', async () => {
      mockAccessVerificationService.verifyIsOwner.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'membership-1',
        user_id: 'target-1',
        role: { slug: 'owner' as string | null },
      });

      await expect(
        service.removePermissionOverride(
          'org-1',
          'membership-1',
          'perm-1',
          'owner-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when permission is missing', async () => {
      mockAccessVerificationService.verifyIsOwner.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'membership-1',
        user_id: 'target-1',
        role: { slug: 'agent' as string | null },
      });
      mockPrismaService.permission.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.removePermissionOverride(
          'org-1',
          'membership-1',
          'perm-404',
          'owner-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('supports batch-style delete path using deleteMany and emits invalidation event', async () => {
      mockAccessVerificationService.verifyIsOwner.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'membership-1',
        user_id: 'target-1',
        role: { slug: 'agent' as string | null },
      });
      mockPrismaService.permission.findFirst.mockResolvedValueOnce({
        id: 'perm-1',
      });
      mockPrismaService.membershipPermissionOverride.deleteMany.mockResolvedValueOnce(
        { count: 2 },
      );

      const result = await service.removePermissionOverride(
        'org-1',
        'membership-1',
        'perm-1',
        'owner-1',
      );

      expect(result.message).toBe(
        'organizations.MESSAGES.PERMISSION_OVERRIDE_CREATED_SUCCESSFULLY',
      );
      expect(
        mockPrismaService.membershipPermissionOverride.deleteMany,
      ).toHaveBeenCalledWith({
        where: {
          membership_id: 'membership-1',
          permission_id: 'perm-1',
        },
      });
      expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
        'permissions.cache.clear-user',
        {
          userId: 'target-1',
          organizationId: 'org-1',
        },
      );
    });
  });

  describe('getMemberPermissionBreakdown', () => {
    it('passes through ForbiddenException when caller is not owner', async () => {
      mockAccessVerificationService.verifyIsOwner.mockRejectedValueOnce(
        new ForbiddenException('organizations.ERRORS.ONLY_OWNER_CAN_PERFORM_THIS_ACTION'),
      );

      await expect(
        service.getMemberPermissionBreakdown('org-1', 'membership-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when membership is not in organization scope', async () => {
      mockAccessVerificationService.verifyIsOwner.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
        null,
      );

      await expect(
        service.getMemberPermissionBreakdown(
          'org-1',
          'membership-1',
          'owner-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAllPermissions', () => {
    it('propagates database errors', async () => {
      mockPrismaService.permission.findMany.mockRejectedValueOnce(
        new Error('permission query failed'),
      );

      await expect(service.getAllPermissions()).rejects.toThrow(
        'permission query failed',
      );
    });
  });
});
