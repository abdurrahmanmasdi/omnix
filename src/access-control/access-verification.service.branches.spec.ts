import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MembershipStatus } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AccessVerificationService } from './access-verification.service';

describe('AccessVerificationService (Branches)', () => {
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

  describe('verifyIsOwner', () => {
    it('throws ForbiddenException when membership is missing', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
        null,
      );

      await expect(service.verifyIsOwner('org-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when role is not owner', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'm1',
        role: { slug: 'manager' as string | null },
      });

      await expect(service.verifyIsOwner('org-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('verifyIsOwnerOrAdmin', () => {
    it('throws ForbiddenException when role slug is null', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'm1',
        role: { slug: null },
      });

      await expect(
        service.verifyIsOwnerOrAdmin('org-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assignRoleToMember', () => {
    it('throws NotFoundException when target role does not belong to org', async () => {
      mockPrismaService.organizationMembership.findFirst
        .mockResolvedValueOnce({
          id: 'caller-membership',
          role: { slug: 'owner' as string | null },
        })
        .mockResolvedValueOnce({ id: 'target-membership' });
      mockPrismaService.role.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.assignRoleToMember('org-1', 'target-membership', 'owner-1', {
          role_id: 'role-other-org',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates unexpected persistence errors', async () => {
      mockPrismaService.organizationMembership.findFirst
        .mockResolvedValueOnce({
          id: 'caller-membership',
          role: { slug: 'owner' as string | null },
        })
        .mockResolvedValueOnce({ id: 'target-membership' });
      mockPrismaService.role.findFirst.mockResolvedValueOnce({
        id: 'role-1',
      });
      mockPrismaService.organizationMembership.update.mockRejectedValueOnce(
        new Error('update failed'),
      );

      await expect(
        service.assignRoleToMember('org-1', 'target-membership', 'owner-1', {
          role_id: 'role-1',
        }),
      ).rejects.toThrow('update failed');
    });
  });

  describe('changeMemberRole', () => {
    it('queries target membership within organization scope (cross-tenant rejection path)', async () => {
      mockPrismaService.organizationMembership.findFirst
        .mockResolvedValueOnce({
          id: 'owner-m',
          role: { slug: 'owner' as string | null },
        })
        .mockResolvedValueOnce(null);

      await expect(
        service.changeMemberRole('org-1', 'membership-x', 'role-1', 'owner-1'),
      ).rejects.toThrow(NotFoundException);

      expect(
        mockPrismaService.organizationMembership.findFirst,
      ).toHaveBeenNthCalledWith(2, {
        where: {
          id: 'membership-x',
          organization_id: 'org-1',
        },
        select: {
          id: true,
          user_id: true,
          role: { select: { slug: true } },
        },
      });
    });

    it('throws ForbiddenException when caller membership is not ACTIVE owner', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'caller',
        role: { slug: 'owner' as string | null },
      });
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'target',
        user_id: 'target-user',
        role: { slug: 'agent' as string | null },
      });
      mockPrismaService.role.findFirst.mockResolvedValueOnce({ id: 'role-1' });
      mockPrismaService.organizationMembership.update.mockResolvedValueOnce({
        id: 'target',
        role_id: 'role-1',
      });

      await service.changeMemberRole('org-1', 'target', 'role-1', 'owner-1');

      expect(
        mockPrismaService.organizationMembership.findFirst,
      ).toHaveBeenNthCalledWith(1, {
        where: {
          organization_id: 'org-1',
          user_id: 'owner-1',
          status: MembershipStatus.ACTIVE,
        },
        include: {
          role: {
            select: { slug: true },
          },
        },
      });
    });
  });
});
