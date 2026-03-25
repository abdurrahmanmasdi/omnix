import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationMembershipStatus } from '../organizations/constants/membership-status.enum';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrisma = {
    user: { findUnique: jest.fn() },
    organizationMembership: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    invitation: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockI18n = {
    t: jest.fn((key: string) => key),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: I18nService, useValue: mockI18n },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should return user profile', async () => {
    const profile = {
      id: 'u1',
      email: 'user@example.com',
      first_name: 'A',
      last_name: 'B',
      created_at: new Date(),
    };
    mockPrisma.user.findUnique.mockResolvedValue(profile);

    const result = await service.getCurrentUserProfile('u1');

    expect(result).toEqual(profile);
  });

  it('should throw NotFoundException when profile is missing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getCurrentUserProfile('u1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should map memberships in getUserOrganizations', async () => {
    const createdAt = new Date();
    mockPrisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'm1',
        organization_id: 'org1',
        role_id: 'r1',
        status: 'ACTIVE',
        created_at: createdAt,
        organization: {
          id: 'org1',
          name: 'Org',
          slug: 'org',
          is_public: false,
          created_at: createdAt,
        },
        role: { id: 'r1', name: 'Member' },
      },
    ]);

    const result = await service.getUserOrganizations('u1');

    expect(result).toEqual([
      {
        membership_id: 'm1',
        organization_id: 'org1',
        role_id: 'r1',
        status: 'ACTIVE',
        created_at: createdAt,
        organization: {
          id: 'org1',
          name: 'Org',
          slug: 'org',
          is_public: false,
          created_at: createdAt,
        },
        role: { id: 'r1', name: 'Member' },
      },
    ]);
  });

  it('should throw NotFoundException when invite accept user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.acceptOrganizationInvite('u1', 'inv1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when invitation does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
    });
    mockPrisma.invitation.findUnique.mockResolvedValue(null);

    await expect(
      service.acceptOrganizationInvite('u1', 'inv1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when invitation does not belong to user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
    });
    mockPrisma.invitation.findUnique.mockResolvedValue({
      id: 'inv1',
      email: 'other@example.com',
      status: 'pending',
      organization_id: 'org1',
      role_id: 'r1',
      organization: { id: 'org1', name: 'Org', slug: 'org' },
      role: { id: 'r1', name: 'Member' },
    });

    await expect(
      service.acceptOrganizationInvite('u1', 'inv1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when invitation status is not pending', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
    });
    mockPrisma.invitation.findUnique.mockResolvedValue({
      id: 'inv1',
      email: 'user@example.com',
      status: 'accepted',
      organization_id: 'org1',
      role_id: 'r1',
      organization: { id: 'org1', name: 'Org', slug: 'org' },
      role: { id: 'r1', name: 'Member' },
    });

    await expect(
      service.acceptOrganizationInvite('u1', 'inv1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw ConflictException when user is already a member while accepting invite', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
    });
    mockPrisma.invitation.findUnique.mockResolvedValue({
      id: 'inv1',
      email: 'user@example.com',
      status: 'pending',
      organization_id: 'org1',
      role_id: 'r1',
      organization: { id: 'org1', name: 'Org', slug: 'org' },
      role: { id: 'r1', name: 'Member' },
    });
    mockPrisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });

    await expect(
      service.acceptOrganizationInvite('u1', 'inv1'),
    ).rejects.toThrow(ConflictException);
  });

  it('should accept invitation and create active membership', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
    });
    mockPrisma.invitation.findUnique.mockResolvedValue({
      id: 'inv1',
      email: 'user@example.com',
      status: 'pending',
      organization_id: 'org1',
      role_id: 'r1',
      organization: { id: 'org1', name: 'Org', slug: 'org' },
      role: { id: 'r1', name: 'Manager' },
    });
    mockPrisma.organizationMembership.findFirst.mockResolvedValue(null);

    mockPrisma.$transaction.mockResolvedValue({
      id: 'm1',
      organization: { name: 'Org', slug: 'org' },
      role: { name: 'Manager' },
    });

    const result = await service.acceptOrganizationInvite('u1', 'inv1');

    expect(result.membership_id).toBe('m1');
    expect(result.organization_name).toBe('Org');
    expect(result.role).toBe('Manager');
  });

  it('should throw NotFoundException when cancel request membership is missing or not owned', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null);

    await expect(service.cancelJoinRequest('u1', 'm1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw BadRequestException when cancel request status is not PENDING', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue({
      id: 'm1',
      user_id: 'u1',
      status: OrganizationMembershipStatus.ACTIVE,
    });

    await expect(service.cancelJoinRequest('u1', 'm1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should delete membership when cancel request is valid', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue({
      id: 'm1',
      user_id: 'u1',
      status: OrganizationMembershipStatus.PENDING,
    });
    mockPrisma.organizationMembership.delete.mockResolvedValue({ id: 'm1' });

    const result = await service.cancelJoinRequest('u1', 'm1');

    expect(mockPrisma.organizationMembership.delete).toHaveBeenCalledWith({
      where: { id: 'm1' },
    });
    expect(result).toEqual({
      message: 'Join request cancelled successfully.',
      membershipId: 'm1',
    });
  });
});
