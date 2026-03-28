/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { MembershipStatus } from '@prisma/client';
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
      message: 'saved',
      invitationId: 'inv1',
      status: 'invitation_created',
    });
    const req = { user: { id: 'u1' } } as any;

    const result = await controller.invite('org1', req, {
      email: 'invitee@example.com',
      roleId: 'r1',
    });

    expect(mockInvitationsService.invite).toHaveBeenCalledWith('org1', {
      email: 'invitee@example.com',
      roleId: 'r1',
    });
    expect(result.invitationId).toBe('inv1');
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
    );
    expect(result.status).toBe(MembershipStatus.REJECTED);
  });
});
