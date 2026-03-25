import {
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationMembershipStatus } from './constants/membership-status.enum';
import { OrganizationsService } from './organizations.service';

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
        status: OrganizationMembershipStatus.PENDING,
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

  it('should throw ConflictException when joining existing membership', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u1' });
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrismaService.organizationMembership.findFirst.mockResolvedValue({
      id: 'm1',
    });

    await expect(service.join('u1', { slug: 'acme' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('should approve pending request and set ACTIVE with roleId', async () => {
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrismaService.role.findUnique.mockResolvedValue({
      id: 'r2',
      organization_id: 'org1',
    });
    mockPrismaService.organizationMembership.findFirst.mockResolvedValue({
      id: 'm1',
      status: OrganizationMembershipStatus.PENDING,
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
        status: OrganizationMembershipStatus.ACTIVE,
        role_id: 'r2',
      },
    });
    expect(result.status).toBe(OrganizationMembershipStatus.ACTIVE);
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
      status: OrganizationMembershipStatus.PENDING,
    });
    mockPrismaService.organizationMembership.update.mockResolvedValue({
      id: 'm1',
    });

    const result = await service.rejectJoinRequest('org1', 'm1', 'admin1');

    expect(
      mockPrismaService.organizationMembership.update,
    ).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { status: OrganizationMembershipStatus.REJECTED },
    });
    expect(result.status).toBe(OrganizationMembershipStatus.REJECTED);
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
});
