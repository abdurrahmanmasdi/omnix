import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MembershipStatus } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { AccessVerificationService } from '../access-control/access-verification.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MembershipsService } from './memberships.service';
import { RequestContextService } from '../request-context/request-context.service';

describe('MembershipsService', () => {
  let service: MembershipsService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    organizationMembership: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockI18nService = {
    t: jest.fn((key: string) => key),
  };

  const mockAccessVerificationService = {
    verifyIsOwnerOrAdmin: jest.fn(),
  };

  const mockRedisService = {
    del: jest.fn(),
  };

  const mockRequestContextService = {
    runWithBypass: jest.fn(async (callback: () => Promise<unknown>) =>
      callback(),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedisService.del.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: I18nService,
          useValue: mockI18nService,
        },
        {
          provide: AccessVerificationService,
          useValue: mockAccessVerificationService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: RequestContextService,
          useValue: mockRequestContextService,
        },
      ],
    }).compile();

    service = module.get<MembershipsService>(MembershipsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPendingRequests', () => {
    it('throws ForbiddenException when caller is not active member', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
        null,
      );

      await expect(
        service.getPendingRequests('org-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('maps unexpected errors to InternalServerErrorException', async () => {
      mockPrismaService.organizationMembership.findFirst.mockRejectedValueOnce(
        new Error('db down'),
      );

      await expect(
        service.getPendingRequests('org-1', 'user-1'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('join', () => {
    const joinDto = { slug: 'alpha' };

    it('throws NotFoundException when user is missing', async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.join('user-1', joinDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when organization is missing', async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce({ id: 'user-1' });
      mockPrismaService.organization.findUnique.mockResolvedValueOnce(null);

      await expect(service.join('user-1', joinDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when membership is already ACTIVE', async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce({ id: 'user-1' });
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
      });
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'm1',
        status: MembershipStatus.ACTIVE,
      });

      await expect(service.join('user-1', joinDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when membership is already PENDING', async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce({ id: 'user-1' });
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
      });
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'm1',
        status: MembershipStatus.PENDING,
      });

      await expect(service.join('user-1', joinDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('re-opens REJECTED membership to PENDING', async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce({ id: 'user-1' });
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
      });
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'm1',
        user_id: 'user-1',
        status: MembershipStatus.REJECTED,
      });

      const result = await service.join('user-1', joinDto);

      expect(
        mockPrismaService.organizationMembership.update,
      ).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { status: MembershipStatus.PENDING },
      });
      expect(mockRedisService.del).toHaveBeenCalledWith(
        'org_membership:org-1:user-1',
      );
      expect(mockRedisService.del).toHaveBeenCalledTimes(1);
      expect(result.organizationId).toBe('org-1');
    });

    it('creates global member role if it does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce({ id: 'user-1' });
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
      });
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
        null,
      );
      mockPrismaService.role.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.role.create.mockResolvedValueOnce({
        id: 'role-member',
      });
      mockPrismaService.organizationMembership.create.mockResolvedValueOnce({
        id: 'm-created',
      });

      const result = await service.join('user-1', joinDto);

      expect(mockPrismaService.role.create).toHaveBeenCalled();
      expect(
        mockPrismaService.organizationMembership.create,
      ).toHaveBeenCalledWith({
        data: {
          user_id: 'user-1',
          organization_id: 'org-1',
          role_id: 'role-member',
          status: MembershipStatus.PENDING,
        },
      });
      expect(result.organizationId).toBe('org-1');
    });
  });

  describe('approveJoinRequest', () => {
    const dto = { roleId: 'role-1' };

    it('throws NotFoundException when role belongs to another org', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
      });
      mockPrismaService.role.findUnique.mockResolvedValueOnce({
        id: 'role-1',
        organization_id: 'org-2',
      });

      await expect(
        service.approveJoinRequest('org-1', 'membership-1', 'caller', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when trying to assign owner role', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
      });
      mockPrismaService.role.findUnique.mockResolvedValueOnce({
        id: 'role-1',
        organization_id: 'org-1',
        slug: 'owner',
      });

      await expect(
        service.approveJoinRequest('org-1', 'membership-1', 'caller', dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when pending request is missing', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
      });
      mockPrismaService.role.findUnique.mockResolvedValueOnce({
        id: 'role-1',
        organization_id: 'org-1',
        slug: 'agent',
      });
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
        null,
      );

      await expect(
        service.approveJoinRequest('org-1', 'membership-1', 'caller', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when membership is already active', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
      });
      mockPrismaService.role.findUnique.mockResolvedValueOnce({
        id: 'role-1',
        organization_id: 'org-1',
        slug: 'agent',
      });
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'membership-1',
        organization_id: 'org-1',
        user_id: 'user-target',
        status: MembershipStatus.ACTIVE,
      });

      await expect(
        service.approveJoinRequest('org-1', 'membership-1', 'caller', dto),
      ).rejects.toThrow(ConflictException);

      expect(
        mockPrismaService.organizationMembership.update,
      ).not.toHaveBeenCalled();
      expect(mockRedisService.del).not.toHaveBeenCalled();
    });

    it('approves pending request and invalidates membership cache', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
      });
      mockPrismaService.role.findUnique.mockResolvedValueOnce({
        id: 'role-1',
        organization_id: 'org-1',
        slug: 'agent',
      });
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'membership-1',
        organization_id: 'org-1',
        user_id: 'user-target',
        status: MembershipStatus.PENDING,
      });
      mockPrismaService.organizationMembership.update.mockResolvedValueOnce({
        id: 'membership-1',
      });

      const result = await service.approveJoinRequest(
        'org-1',
        'membership-1',
        'caller',
        dto,
      );

      expect(mockRedisService.del).toHaveBeenCalledWith(
        'org_membership:org-1:user-target',
      );
      expect(mockRedisService.del).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(MembershipStatus.ACTIVE);
    });
  });

  describe('rejectJoinRequest', () => {
    it('passes through ForbiddenException from access verification', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockRejectedValueOnce(
        new ForbiddenException('auth.ERRORS.INSUFFICIENT_PERMISSIONS'),
      );

      await expect(
        service.rejectJoinRequest('org-1', 'membership-1', 'caller-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when organization is missing', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.organization.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.rejectJoinRequest('org-1', 'membership-1', 'caller-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects pending request and invalidates membership cache', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
      });
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'membership-1',
        organization_id: 'org-1',
        user_id: 'user-target',
        status: MembershipStatus.PENDING,
        role: {
          slug: 'agent',
        },
      });
      mockPrismaService.organizationMembership.update.mockResolvedValueOnce({
        id: 'membership-1',
      });

      const result = await service.rejectJoinRequest(
        'org-1',
        'membership-1',
        'caller-1',
      );

      expect(mockRedisService.del).toHaveBeenCalledWith(
        'org_membership:org-1:user-target',
      );
      expect(mockRedisService.del).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(MembershipStatus.REJECTED);
    });

    it('throws ConflictException when attempting to remove the last active owner', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
      });
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'membership-owner',
        organization_id: 'org-1',
        user_id: 'owner-user',
        status: MembershipStatus.ACTIVE,
        role: {
          slug: 'owner',
        },
      });
      mockPrismaService.organizationMembership.findMany.mockResolvedValueOnce([
        { id: 'membership-owner' },
      ]);

      await expect(
        service.rejectJoinRequest('org-1', 'membership-owner', 'caller-1'),
      ).rejects.toThrow(ConflictException);

      expect(
        mockPrismaService.organizationMembership.update,
      ).not.toHaveBeenCalled();
      expect(mockRedisService.del).not.toHaveBeenCalled();
    });
  });

  describe('getOrganizationMembers', () => {
    it('throws ForbiddenException when caller is outside tenant', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
        null,
      );

      await expect(
        service.getOrganizationMembers('org-1', 'caller-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns mapped active members when caller is active member', async () => {
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'active-m',
      });
      mockPrismaService.organizationMembership.findMany.mockResolvedValueOnce([
        {
          id: 'm1',
          organization_id: 'org-1',
          status: MembershipStatus.ACTIVE,
          user: {
            id: 'u1',
            first_name: 'A',
            last_name: 'B',
            email: 'u1@test.com',
            created_at: new Date('2026-03-29T00:00:00.000Z'),
          },
          role: {
            id: 'r1',
            name: 'agent',
          },
        },
      ]);

      const result = await service.getOrganizationMembers('org-1', 'caller-1');

      expect(result).toEqual([
        {
          membershipId: 'm1',
          organizationId: 'org-1',
          user: {
            id: 'u1',
            firstName: 'A',
            lastName: 'B',
            email: 'u1@test.com',
            createdAt: new Date('2026-03-29T00:00:00.000Z'),
          },
          role: {
            id: 'r1',
            name: 'agent',
          },
          status: MembershipStatus.ACTIVE,
        },
      ]);
    });
  });
});
