import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MembershipStatus } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AccessVerificationService } from './access-verification.service';

describe('AccessVerificationService', () => {
  let service: AccessVerificationService;

  const mockPrismaService = {
    organizationMembership: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
    },
  };

  const mockI18nService = {
    t: jest.fn((key: string) => key),
  };

  const mockEventEmitter = {
    emitAsync: jest.fn().mockResolvedValue([]),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
  };

  const ownerCaller = {
    id: 'membership-owner',
    role: { slug: 'owner' as string | null },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedisService.get.mockResolvedValue(null);
    mockRedisService.set.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessVerificationService,
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
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<AccessVerificationService>(AccessVerificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyUserInOrganization', () => {
    it('returns immediately when active membership is found in Redis cache', async () => {
      mockRedisService.get.mockResolvedValueOnce(MembershipStatus.ACTIVE);

      await expect(
        service.verifyUserInOrganization('org-1', 'user-1'),
      ).resolves.toBeUndefined();

      expect(mockRedisService.get).toHaveBeenCalledWith(
        'org_membership:org-1:user-1',
      );
      expect(
        mockPrismaService.organizationMembership.findFirst,
      ).not.toHaveBeenCalled();
    });

    it('writes active membership to Redis on cache miss and DB success', async () => {
      mockRedisService.get.mockResolvedValueOnce(null);
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'membership-1',
      });

      await expect(
        service.verifyUserInOrganization('org-1', 'user-1'),
      ).resolves.toBeUndefined();

      expect(mockRedisService.set).toHaveBeenCalledWith(
        'org_membership:org-1:user-1',
        MembershipStatus.ACTIVE,
        900,
      );
    });

    it('throws ForbiddenException when membership is missing', async () => {
      mockRedisService.get.mockResolvedValueOnce(null);
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
        null,
      );

      await expect(
        service.verifyUserInOrganization('org-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);

      expect(
        mockPrismaService.organizationMembership.findFirst,
      ).toHaveBeenCalledWith({
        where: {
          organization_id: 'org-1',
          user_id: 'user-1',
          status: MembershipStatus.ACTIVE,
        },
        select: { id: true },
      });
      expect(mockRedisService.set).not.toHaveBeenCalled();
    });
  });

  describe('verifyIsOwnerOrAdmin', () => {
    it('throws ForbiddenException when caller role is not privileged', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'm-agent',
        role: { slug: 'agent' as string | null },
      });

      await expect(
        service.verifyIsOwnerOrAdmin('org-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows owner and manager roles', async () => {
      mockPrismaService.organizationMembership.findFirst
        .mockResolvedValueOnce({
          id: 'm-owner',
          role: { slug: 'owner' as string | null },
        })
        .mockResolvedValueOnce({
          id: 'm-manager',
          role: { slug: 'manager' as string | null },
        });

      await expect(
        service.verifyIsOwnerOrAdmin('org-1', 'owner-1'),
      ).resolves.toBeUndefined();
      await expect(
        service.verifyIsOwnerOrAdmin('org-1', 'manager-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('assignRoleToMember', () => {
    const orgId = 'org-1';
    const membershipId = 'membership-1';
    const callerId = 'user-1';

    it('throws NotFoundException when target membership does not exist', async () => {
      mockPrismaService.organizationMembership.findFirst
        .mockResolvedValueOnce({
          id: 'caller-membership',
          role: { slug: 'manager' as string | null },
        })
        .mockResolvedValueOnce(null);

      await expect(
        service.assignRoleToMember(orgId, membershipId, callerId, {
          role_id: 'role-2',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates role when membership and role are valid', async () => {
      mockPrismaService.organizationMembership.findFirst
        .mockResolvedValueOnce({
          id: 'caller-membership',
          role: { slug: 'manager' as string | null },
        })
        .mockResolvedValueOnce({ id: membershipId });
      mockPrismaService.role.findFirst.mockResolvedValueOnce({ id: 'role-2' });
      mockPrismaService.organizationMembership.update.mockResolvedValueOnce({
        id: membershipId,
        role_id: 'role-2',
      });

      const result = await service.assignRoleToMember(
        orgId,
        membershipId,
        callerId,
        {
          role_id: 'role-2',
        },
      );

      expect(result).toEqual({
        id: membershipId,
        role_id: 'role-2',
        message: 'organizations.MESSAGES.ROLE_ASSIGNED_SUCCESSFULLY',
      });
    });

    it('throws ForbiddenException when caller is not owner/admin', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'caller-membership',
        role: { slug: 'agent' as string | null },
      });

      await expect(
        service.assignRoleToMember(orgId, membershipId, callerId, {
          role_id: 'role-2',
        }),
      ).rejects.toThrow(ForbiddenException);
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
        'organizations.ERRORS.CANNOT_MODIFY_OWNER_ROLE',
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
});
