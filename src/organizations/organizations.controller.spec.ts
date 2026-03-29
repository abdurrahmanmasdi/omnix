/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { MembershipStatus } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { MembershipsService } from './memberships.service';
import { InvitationsService } from './invitations.service';
import { PermissionsService } from '../auth/services/permissions.service';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;

  const mockOrganizationsService = {
    create: jest.fn(),
  };

  const mockMembershipsService = {
    getPendingRequests: jest.fn(),
    join: jest.fn(),
    approveJoinRequest: jest.fn(),
    rejectJoinRequest: jest.fn(),
    getOrganizationMembers: jest.fn(),
  };

  const mockInvitationsService = {
    invite: jest.fn(),
    getInvitationByToken: jest.fn(),
    acceptInvitation: jest.fn(),
    listPendingInvitations: jest.fn(),
  };

  const mockPermissionsService = {
    getEffectivePermissions: jest.fn().mockResolvedValue([]),
  };

  const mockI18nService = {
    t: jest.fn((key: string) => key),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        {
          provide: OrganizationsService,
          useValue: mockOrganizationsService,
        },
        {
          provide: MembershipsService,
          useValue: mockMembershipsService,
        },
        {
          provide: InvitationsService,
          useValue: mockInvitationsService,
        },
        {
          provide: PermissionsService,
          useValue: mockPermissionsService,
        },
        {
          provide: I18nService,
          useValue: mockI18nService,
        },
      ],
    }).compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate getPendingRequests', async () => {
    mockMembershipsService.getPendingRequests.mockResolvedValue([
      { membershipId: 'm1' },
    ]);
    const req = { user: { id: 'u1' } } as any;

    const result = await controller.getPendingRequests('org1', req);

    expect(mockMembershipsService.getPendingRequests).toHaveBeenCalledWith(
      'org1',
      'u1',
    );
    expect(result).toEqual([{ membershipId: 'm1' }]);
  });

  it('should delegate create', async () => {
    mockOrganizationsService.create.mockResolvedValue({ id: 'org1' });
    const req = { user: { id: 'u1' } } as any;

    const result = await controller.create(req, {
      name: 'Org',
      slug: 'org',
      is_public: false,
    });

    expect(mockOrganizationsService.create).toHaveBeenCalledWith('u1', {
      name: 'Org',
      slug: 'org',
      is_public: false,
    });
    expect(result).toEqual({ id: 'org1' });
  });

  it('should delegate join', async () => {
    mockMembershipsService.join.mockResolvedValue({
      message: 'ok',
      organizationId: 'org1',
    });
    const req = { user: { id: 'u1' } } as any;

    const result = await controller.join(req, { slug: 'org' });

    expect(mockMembershipsService.join).toHaveBeenCalledWith('u1', {
      slug: 'org',
    });
    expect(result.organizationId).toBe('org1');
  });

  it('should delegate invite', async () => {
    mockInvitationsService.invite.mockResolvedValue({
      inviteUrl: 'https://frontend.example.com/invite/token-123',
      token: 'token-123',
    });
    const req = { user: { id: 'u1' } } as any;

    const result = await controller.invite('org1', req, {
      email: 'invitee@example.com',
      roleId: 'r1',
    });

    expect(mockInvitationsService.invite).toHaveBeenCalledWith('org1', 'u1', {
      email: 'invitee@example.com',
      roleId: 'r1',
    });
    expect(result.token).toBe('token-123');
    expect(result.inviteUrl).toBe(
      'https://frontend.example.com/invite/token-123',
    );
  });

  it('should throw ForbiddenException for non-admin invite attempts', async () => {
    mockInvitationsService.invite.mockRejectedValueOnce(
      new ForbiddenException('auth.ERRORS.INSUFFICIENT_PERMISSIONS'),
    );
    const req = { user: { id: 'member1' } } as any;

    await expect(
      controller.invite('org1', req, {
        email: 'invitee@example.com',
        roleId: 'r1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should delegate approve request', async () => {
    mockMembershipsService.approveJoinRequest.mockResolvedValue({
      message: 'approved',
      membershipId: 'm1',
      status: MembershipStatus.ACTIVE,
    });
    const req = { user: { id: 'admin1' } } as any;

    const result = await controller.approveRequest('org1', 'm1', req, {
      roleId: 'r1',
    });

    expect(mockMembershipsService.approveJoinRequest).toHaveBeenCalledWith(
      'org1',
      'm1',
      'admin1',
      { roleId: 'r1' },
    );
    expect(result.status).toBe(MembershipStatus.ACTIVE);
  });

  it('should delegate reject request', async () => {
    mockMembershipsService.rejectJoinRequest.mockResolvedValue({
      message: 'rejected',
      membershipId: 'm1',
      status: MembershipStatus.REJECTED,
    });
    const req = { user: { id: 'admin1' } } as any;

    const result = await controller.rejectRequest('org1', 'm1', req);

    expect(mockMembershipsService.rejectJoinRequest).toHaveBeenCalledWith(
      'org1',
      'm1',
      'admin1',
    );
    expect(result.status).toBe(MembershipStatus.REJECTED);
  });

  it('should throw ForbiddenException for non-admin reject attempts', async () => {
    mockMembershipsService.rejectJoinRequest.mockRejectedValueOnce(
      new ForbiddenException('auth.ERRORS.INSUFFICIENT_PERMISSIONS'),
    );
    const req = { user: { id: 'member1' } } as any;

    await expect(controller.rejectRequest('org1', 'm1', req)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should delegate getInvitationByToken', async () => {
    mockInvitationsService.getInvitationByToken.mockResolvedValue({
      organizationName: 'Acme Inc',
      roleName: 'Agent',
      email: 'invitee@example.com',
      status: 'pending',
    });

    const result = await controller.getInvitationByToken('token-123');

    expect(mockInvitationsService.getInvitationByToken).toHaveBeenCalledWith(
      'token-123',
    );
    expect(result).toEqual({
      organizationName: 'Acme Inc',
      roleName: 'Agent',
      email: 'invitee@example.com',
      status: 'pending',
    });
  });

  it('should delegate acceptInvitation', async () => {
    mockInvitationsService.acceptInvitation.mockResolvedValue({
      message: 'Accepted',
      organizationId: 'org-1',
      membershipId: 'membership-1',
    });
    const req = {
      user: {
        id: 'u1',
        email: 'invitee@example.com',
      },
    } as any;

    const result = await controller.acceptInvitation('token-123', req);

    expect(mockInvitationsService.acceptInvitation).toHaveBeenCalledWith(
      'token-123',
      'u1',
      'invitee@example.com',
    );
    expect(result).toEqual({
      message: 'Accepted',
      organizationId: 'org-1',
      membershipId: 'membership-1',
    });
  });

  it('should delegate listPendingInvitations', async () => {
    mockInvitationsService.listPendingInvitations.mockResolvedValue([
      {
        id: 'invite-1',
        token: 'token-1',
        email: 'invitee@example.com',
        status: 'pending',
        created_at: new Date('2026-03-28T10:00:00.000Z'),
        inviteUrl: 'https://frontend.example.com/invite/token-1',
        role: {
          id: 'role-1',
          name: 'Agent',
        },
      },
    ]);
    const req = { user: { id: 'owner-1' } } as any;

    const result = await controller.listPendingInvitations('org-1', req);

    expect(mockInvitationsService.listPendingInvitations).toHaveBeenCalledWith(
      'org-1',
      'owner-1',
    );
    expect(result).toEqual([
      {
        id: 'invite-1',
        token: 'token-1',
        email: 'invitee@example.com',
        status: 'pending',
        created_at: new Date('2026-03-28T10:00:00.000Z'),
        inviteUrl: 'https://frontend.example.com/invite/token-1',
        role: {
          id: 'role-1',
          name: 'Agent',
        },
      },
    ]);
  });
});
