import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationsService } from './organizations.service';
import { MembershipStatus } from '@prisma/client';

describe('OrganizationsService', () => {
  let service: OrganizationsService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    organization: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    organizationMembership: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    invitation: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const mockI18n = {
    t: jest.fn((key: string) => key),
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
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create join request with PENDING status when user and org exist', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u1' });
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrismaService.organizationMembership.findFirst.mockResolvedValue(null);
    mockPrismaService.role.findFirst.mockResolvedValue({ id: 'role1' });
    mockPrismaService.organizationMembership.create.mockResolvedValue({
      id: 'm1',
    });

    const result = await service.join('u1', { slug: 'acme' });

    expect(
      mockPrismaService.organizationMembership.create,
    ).toHaveBeenCalledWith({
      data: {
        user_id: 'u1',
        organization_id: 'org1',
        role_id: 'role1',
        status: MembershipStatus.PENDING,
      },
    });
    expect(result).toEqual({
      message: 'errors.ORG.JOIN_REQUEST_CREATED',
      organizationId: 'org1',
    });
  });

  it('should create global member role when missing during join', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u1' });
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrismaService.organizationMembership.findFirst.mockResolvedValue(null);
    mockPrismaService.role.findFirst.mockResolvedValue(null);
    mockPrismaService.role.create.mockResolvedValue({ id: 'roleNew' });
    mockPrismaService.organizationMembership.create.mockResolvedValue({
      id: 'm1',
    });

    await service.join('u1', { slug: 'acme' });

    expect(mockPrismaService.role.create).toHaveBeenCalledWith({
      data: {
        name: 'member',
        organization_id: null,
      },
    });
  });

  it('should throw NotFoundException when join user does not exist', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);

    await expect(service.join('u1', { slug: 'acme' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw BadRequestException when joining with ACTIVE membership', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u1' });
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrismaService.organizationMembership.findFirst.mockResolvedValue({
      id: 'm1',
      status: MembershipStatus.ACTIVE,
    });

    await expect(service.join('u1', { slug: 'acme' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException when joining with PENDING membership', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u1' });
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrismaService.organizationMembership.findFirst.mockResolvedValue({
      id: 'm1',
      status: MembershipStatus.PENDING,
    });

    await expect(service.join('u1', { slug: 'acme' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should update REJECTED membership back to PENDING instead of creating new record', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u1' });
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrismaService.organizationMembership.findFirst.mockResolvedValue({
      id: 'm1',
      status: MembershipStatus.REJECTED,
    });
    mockPrismaService.organizationMembership.update.mockResolvedValue({
      id: 'm1',
      status: MembershipStatus.PENDING,
    });

    const result = await service.join('u1', { slug: 'acme' });

    expect(
      mockPrismaService.organizationMembership.update,
    ).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { status: MembershipStatus.PENDING },
    });
    expect(
      mockPrismaService.organizationMembership.create,
    ).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: 'errors.ORG.JOIN_REQUEST_CREATED',
      organizationId: 'org1',
    });
  });

  it('should handle lowercase rejected status by updating to PENDING', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u1' });
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrismaService.organizationMembership.findFirst.mockResolvedValue({
      id: 'm1',
      status: 'rejected',
    });
    mockPrismaService.organizationMembership.update.mockResolvedValue({
      id: 'm1',
      status: MembershipStatus.PENDING,
    });

    await service.join('u1', { slug: 'acme' });

    expect(mockPrismaService.organizationMembership.update).toHaveBeenCalled();
    expect(
      mockPrismaService.organizationMembership.create,
    ).not.toHaveBeenCalled();
  });

  it('should continue to create membership when no existing record exists', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u1' });
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrismaService.organizationMembership.findFirst.mockResolvedValue(null);
    mockPrismaService.role.findFirst.mockResolvedValue({ id: 'role1' });
    mockPrismaService.organizationMembership.create.mockResolvedValue({
      id: 'm1',
    });

    await service.join('u1', { slug: 'acme' });

    expect(mockPrismaService.organizationMembership.create).toHaveBeenCalled();
    expect(
      mockPrismaService.organizationMembership.update,
    ).not.toHaveBeenCalled();
  });

  it('should approve pending request and set ACTIVE with roleId', async () => {
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrismaService.role.findUnique.mockResolvedValue({
      id: 'r2',
      organization_id: 'org1',
    });
    mockPrismaService.organizationMembership.findFirst.mockResolvedValue({
      id: 'm1',
      status: MembershipStatus.PENDING,
    });
    mockPrismaService.organizationMembership.update.mockResolvedValue({
      id: 'm1',
    });

    const result = await service.approveJoinRequest('org1', 'm1', 'admin1', {
      roleId: 'r2',
    });

    expect(
      mockPrismaService.organizationMembership.update,
    ).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: {
        status: MembershipStatus.ACTIVE,
        role_id: 'r2',
      },
    });
    expect(result.status).toBe(MembershipStatus.ACTIVE);
  });

  it('should reject request when pending membership is not found on approve', async () => {
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrismaService.role.findUnique.mockResolvedValue({
      id: 'r2',
      organization_id: 'org1',
    });
    mockPrismaService.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(
      service.approveJoinRequest('org1', 'm1', 'admin1', { roleId: 'r2' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should reject pending request and set REJECTED', async () => {
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrismaService.organizationMembership.findFirst.mockResolvedValue({
      id: 'm1',
      status: MembershipStatus.PENDING,
    });
    mockPrismaService.organizationMembership.update.mockResolvedValue({
      id: 'm1',
    });

    const result = await service.rejectJoinRequest('org1', 'm1', 'admin1');

    expect(
      mockPrismaService.organizationMembership.update,
    ).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { status: MembershipStatus.REJECTED },
    });
    expect(result.status).toBe(MembershipStatus.REJECTED);
  });

  it('should create invitation when no existing invite exists', async () => {
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrismaService.role.findUnique.mockResolvedValue({
      id: 'r1',
      organization_id: 'org1',
    });
    mockPrismaService.user.findUnique.mockResolvedValue(null);
    mockPrismaService.invitation.findUnique.mockResolvedValue(null);
    mockPrismaService.invitation.upsert.mockResolvedValue({ id: 'inv1' });

    const result = await service.invite('org1', {
      email: 'invitee@example.com',
      roleId: 'r1',
    });

    expect(result).toEqual({
      message: 'errors.INVITATION.SAVED',
      invitationId: 'inv1',
      status: 'invitation_created',
    });
  });

  it('should update existing invitation when invite already exists', async () => {
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrismaService.role.findUnique.mockResolvedValue({
      id: 'r1',
      organization_id: 'org1',
    });
    mockPrismaService.user.findUnique.mockResolvedValue(null);
    mockPrismaService.invitation.findUnique.mockResolvedValue({
      id: 'existing',
    });
    mockPrismaService.invitation.upsert.mockResolvedValue({ id: 'inv1' });

    const result = await service.invite('org1', {
      email: 'invitee@example.com',
      roleId: 'r1',
    });

    expect(result.status).toBe('invitation_updated');
  });

  it('should throw ConflictException when inviting existing member', async () => {
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrismaService.role.findUnique.mockResolvedValue({
      id: 'r1',
      organization_id: 'org1',
    });
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u1' });
    mockPrismaService.organizationMembership.findFirst.mockResolvedValue({
      id: 'm1',
    });

    await expect(
      service.invite('org1', { email: 'invitee@example.com', roleId: 'r1' }),
    ).rejects.toThrow(ConflictException);
  });

  it('should map unexpected approve errors to InternalServerErrorException', async () => {
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrismaService.role.findUnique.mockRejectedValue(new Error('db down'));

    await expect(
      service.approveJoinRequest('org1', 'm1', 'admin1', { roleId: 'r1' }),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('should throw ForbiddenException when requester has no active org membership in getPendingRequests', async () => {
    mockPrismaService.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(service.getPendingRequests('org1', 'u1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should return mapped pending requests ordered by newest first', async () => {
    const createdAt = new Date('2026-03-26T10:00:00.000Z');
    const userCreatedAt = new Date('2026-03-25T10:00:00.000Z');

    mockPrismaService.organizationMembership.findFirst.mockResolvedValue({
      id: 'membership-active',
    });
    mockPrismaService.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'm1',
        organization_id: 'org1',
        status: MembershipStatus.PENDING,
        created_at: createdAt,
        user: {
          id: 'u2',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          created_at: userCreatedAt,
        },
      },
    ]);

    const result = await service.getPendingRequests('org1', 'u1');

    expect(
      mockPrismaService.organizationMembership.findMany,
    ).toHaveBeenCalledWith({
      where: {
        organization_id: 'org1',
        status: MembershipStatus.PENDING,
      },
      include: {
        user: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            created_at: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    expect(result).toEqual([
      {
        membershipId: 'm1',
        organizationId: 'org1',
        status: MembershipStatus.PENDING,
        requestedAt: createdAt,
        user: {
          id: 'u2',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          createdAt: userCreatedAt,
        },
      },
    ]);
  });
});
