/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;

  const mockOrganizationsService = {
    create: jest.fn(),
    join: jest.fn(),
    invite: jest.fn(),
    approveJoinRequest: jest.fn(),
    rejectJoinRequest: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        {
          provide: OrganizationsService,
          useValue: mockOrganizationsService,
        },
      ],
    }).compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
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
      status: 'ACTIVE',
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
    expect(result.status).toBe('ACTIVE');
  });

  it('should delegate reject request', async () => {
    mockOrganizationsService.rejectJoinRequest.mockResolvedValue({
      message: 'rejected',
      membershipId: 'm1',
      status: 'REJECTED',
    });
    const req = { user: { id: 'admin1' } } as any;

    const result = await controller.rejectRequest('org1', 'm1', req);

    expect(mockOrganizationsService.rejectJoinRequest).toHaveBeenCalledWith(
      'org1',
      'm1',
      'admin1',
    );
    expect(result.status).toBe('REJECTED');
  });
});
