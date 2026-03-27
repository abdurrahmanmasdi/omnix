/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { MembershipStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { PermissionsService } from '../auth/services/permissions.service';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;

  const mockOrganizationsService = {
    create: jest.fn(),
    getPendingRequests: jest.fn(),
    join: jest.fn(),
    invite: jest.fn(),
    approveJoinRequest: jest.fn(),
    rejectJoinRequest: jest.fn(),
  };

  const mockPermissionsService = {
    clearUserPermissionsCache: jest.fn().mockResolvedValue(undefined),
    clearOrganizationPermissionsCache: jest.fn(),
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
    mockOrganizationsService.getPendingRequests.mockResolvedValue([
      { membershipId: 'm1' },
    ]);
    const req = { user: { id: 'u1' } } as any;

    const result = await controller.getPendingRequests('org1', req);

    expect(mockOrganizationsService.getPendingRequests).toHaveBeenCalledWith(
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
    mockOrganizationsService.join.mockResolvedValue({
      message: 'ok',
      organizationId: 'org1',
    });
    const req = { user: { id: 'u1' } } as any;

    const result = await controller.join(req, { slug: 'org' });

    expect(mockOrganizationsService.join).toHaveBeenCalledWith('u1', {
      slug: 'org',
    });
    expect(result.organizationId).toBe('org1');
  });

  it('should delegate invite', async () => {
    mockOrganizationsService.invite.mockResolvedValue({
      message: 'saved',
      invitationId: 'inv1',
      status: 'invitation_created',
    });
    const req = { user: { id: 'u1' } } as any;

    const result = await controller.invite('org1', req, {
      email: 'invitee@example.com',
      roleId: 'r1',
    });

    expect(mockOrganizationsService.invite).toHaveBeenCalledWith('org1', {
      email: 'invitee@example.com',
      roleId: 'r1',
    });
    expect(result.invitationId).toBe('inv1');
  });

  it('should delegate approve request', async () => {
    mockOrganizationsService.approveJoinRequest.mockResolvedValue({
      message: 'approved',
      membershipId: 'm1',
      status: MembershipStatus.ACTIVE,
    });
    const req = { user: { id: 'admin1' } } as any;

    const result = await controller.approveRequest('org1', 'm1', req, {
      roleId: 'r1',
    });

    expect(mockOrganizationsService.approveJoinRequest).toHaveBeenCalledWith(
      'org1',
      'm1',
      'admin1',
      { roleId: 'r1' },
    );
    expect(result.status).toBe(MembershipStatus.ACTIVE);
  });

  it('should delegate reject request', async () => {
    mockOrganizationsService.rejectJoinRequest.mockResolvedValue({
      message: 'rejected',
      membershipId: 'm1',
      status: MembershipStatus.REJECTED,
    });
    const req = { user: { id: 'admin1' } } as any;

    const result = await controller.rejectRequest('org1', 'm1', req);

    expect(mockOrganizationsService.rejectJoinRequest).toHaveBeenCalledWith(
      'org1',
      'm1',
    );
    expect(result.status).toBe(MembershipStatus.REJECTED);
  });
});
