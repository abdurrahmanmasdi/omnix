import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { AccessVerificationService } from '../access-control/access-verification.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvitationsService } from './invitations.service';
import { RequestContextService } from '../request-context/request-context.service';

describe('InvitationsService', () => {
  let service: InvitationsService;
  const previousFrontendUrl = process.env.FRONTEND_URL;

  const mockPrismaService = {
    organization: {
      findUnique: jest.fn(),
    },
    role: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    organizationMembership: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    invitation: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockI18nService = {
    t: jest.fn((key: string) => key),
  };

  const mockAccessVerificationService = {
    verifyIsOwnerOrAdmin: jest.fn(),
  };

  const mockRequestContextService = {
    runWithBypass: jest.fn(async (callback: () => Promise<unknown>) =>
      callback(),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = 'https://frontend.example.com';
    mockPrismaService.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrismaService) => Promise<unknown>) =>
        callback(mockPrismaService),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationsService,
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
          provide: RequestContextService,
          useValue: mockRequestContextService,
        },
      ],
    }).compile();

    service = module.get<InvitationsService>(InvitationsService);
  });

  afterAll(() => {
    process.env.FRONTEND_URL = previousFrontendUrl;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('invite', () => {
    const inviteDto = { email: 'new@user.com', roleId: 'role-1' };

    it('passes through ForbiddenException for unauthorized caller', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockRejectedValueOnce(
        new ForbiddenException('auth.ERRORS.INSUFFICIENT_PERMISSIONS'),
      );

      await expect(
        service.invite('org-1', 'caller-1', inviteDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when organization does not exist', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.organization.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.invite('org-1', 'caller-1', inviteDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when role belongs to another organization', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
      });
      mockPrismaService.role.findUnique.mockResolvedValueOnce({
        id: 'role-1',
        organization_id: 'org-2',
      });

      const invitePromise = service.invite('org-1', 'caller-1', inviteDto);

      await expect(invitePromise).rejects.toThrow(BadRequestException);
      await expect(invitePromise).rejects.toThrow(
        'Invalid role specified for this organization.',
      );
    });

    it('throws ConflictException when user is already a member', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
      });
      mockPrismaService.role.findUnique.mockResolvedValueOnce({
        id: 'role-1',
        organization_id: 'org-1',
      });
      mockPrismaService.user.findUnique.mockResolvedValueOnce({ id: 'user-1' });
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'm1',
      });

      await expect(
        service.invite('org-1', 'caller-1', inviteDto),
      ).rejects.toThrow(ConflictException);
    });

    it('returns inviteUrl and token, and persists the same token', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
      });
      mockPrismaService.role.findUnique.mockResolvedValueOnce({
        id: 'role-1',
        organization_id: 'org-1',
      });
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

      mockPrismaService.invitation.findUnique.mockImplementationOnce(
        ({ where }: { where: { token?: string } }) => {
          if (where.token) {
            return null;
          }
          return null;
        },
      );

      mockPrismaService.invitation.upsert.mockResolvedValueOnce({
        id: 'invite-1',
      });

      const result = await service.invite('org-1', 'caller-1', inviteDto);

      expect(result.token).toMatch(/^[a-f0-9]{64}$/);
      expect(result.inviteUrl).toBe(
        `https://frontend.example.com/invite/${result.token}`,
      );
      expect(mockPrismaService.invitation.upsert).toHaveBeenCalledWith({
        where: {
          email_organization_id: {
            email: inviteDto.email,
            organization_id: 'org-1',
          },
        },
        update: {
          role_id: inviteDto.roleId,
          token: result.token,
          status: 'pending',
          accepted_at: null,
        },
        create: {
          email: inviteDto.email,
          organization_id: 'org-1',
          role_id: inviteDto.roleId,
          token: result.token,
          status: 'pending',
        },
      });
    });

    it('regenerates token when a collision occurs', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
      });
      mockPrismaService.role.findUnique.mockResolvedValueOnce({
        id: 'role-1',
        organization_id: 'org-1',
      });
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

      mockPrismaService.invitation.findUnique
        .mockResolvedValueOnce({ id: 'existing-token' })
        .mockResolvedValueOnce(null);

      mockPrismaService.invitation.upsert.mockResolvedValueOnce({
        id: 'invite-1',
      });

      const result = await service.invite('org-1', 'caller-1', inviteDto);

      expect(result.token).toMatch(/^[a-f0-9]{64}$/);
      expect(mockPrismaService.invitation.findUnique).toHaveBeenCalledTimes(2);
    });

    it('lets unexpected errors bubble up for global handling', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
      });
      mockPrismaService.role.findUnique.mockResolvedValueOnce({
        id: 'role-1',
        organization_id: 'org-1',
      });
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.invitation.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.invitation.upsert.mockRejectedValueOnce(
        new Error('db fail'),
      );

      await expect(
        service.invite('org-1', 'caller-1', inviteDto),
      ).rejects.toThrow('db fail');
    });
  });

  describe('getInvitationByToken', () => {
    it('returns invitation details for a valid token', async () => {
      mockPrismaService.invitation.findUnique.mockResolvedValueOnce({
        email: 'invitee@example.com',
        status: 'pending',
        organization: { name: 'Acme Inc' },
        role: { name: 'Agent' },
      });

      const result = await service.getInvitationByToken('token-123');

      expect(mockPrismaService.invitation.findUnique).toHaveBeenCalledWith({
        where: { token: 'token-123' },
        select: {
          email: true,
          status: true,
          organization: { select: { name: true } },
          role: { select: { name: true } },
        },
      });
      expect(result).toEqual({
        organizationName: 'Acme Inc',
        roleName: 'Agent',
        email: 'invitee@example.com',
        status: 'pending',
      });
    });

    it('throws NotFoundException when token does not exist', async () => {
      mockPrismaService.invitation.findUnique.mockResolvedValueOnce(null);

      await expect(service.getInvitationByToken('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('maps unexpected errors to InternalServerErrorException', async () => {
      mockPrismaService.invitation.findUnique.mockRejectedValueOnce(
        new Error('db fail'),
      );

      await expect(service.getInvitationByToken('token-123')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('acceptInvitation', () => {
    it('accepts invitation and creates active membership for the authenticated user', async () => {
      mockPrismaService.invitation.findFirst.mockResolvedValueOnce({
        id: 'invite-1',
        email: 'invitee@example.com',
        status: 'pending',
        organization_id: 'org-1',
        role_id: 'role-1',
        organization: {
          name: 'Acme Inc',
        },
      });
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
        null,
      );
      mockPrismaService.invitation.updateMany.mockResolvedValueOnce({
        count: 1,
      });
      mockPrismaService.organizationMembership.create.mockResolvedValueOnce({
        id: 'membership-1',
      });

      const result = await service.acceptInvitation(
        'token-123',
        'user-1',
        'invitee@example.com',
      );

      expect(mockPrismaService.invitation.findFirst).toHaveBeenCalledWith({
        where: { token: 'token-123' },
        select: {
          id: true,
          email: true,
          status: true,
          organization_id: true,
          role_id: true,
          organization: {
            select: {
              name: true,
            },
          },
        },
      });
      expect(
        mockPrismaService.organizationMembership.findFirst,
      ).toHaveBeenCalledWith({
        where: {
          user_id: 'user-1',
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      expect(
        mockPrismaService.organizationMembership.create,
      ).toHaveBeenCalledWith({
        data: {
          user_id: 'user-1',
          organization_id: 'org-1',
          role_id: 'role-1',
          status: 'ACTIVE',
        },
        select: {
          id: true,
        },
      });
      expect(result).toEqual({
        message: 'organizations.ERRORS.INVITATION.ACCEPT_SUCCESS',
        organizationId: 'org-1',
        membershipId: 'membership-1',
      });
    });

    it('throws NotFoundException when token is invalid', async () => {
      mockPrismaService.invitation.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.acceptInvitation(
          'missing-token',
          'user-1',
          'invitee@example.com',
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.invitation.updateMany).not.toHaveBeenCalled();
      expect(
        mockPrismaService.organizationMembership.create,
      ).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when invitation status is not pending', async () => {
      mockPrismaService.invitation.findFirst.mockResolvedValueOnce({
        id: 'invite-1',
        email: 'invitee@example.com',
        status: 'accepted',
        organization_id: 'org-1',
        role_id: 'role-1',
        organization: {
          name: 'Acme Inc',
        },
      });

      await expect(
        service.acceptInvitation('token-123', 'user-1', 'invitee@example.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when invitation email does not match authenticated user', async () => {
      mockPrismaService.invitation.findFirst.mockResolvedValueOnce({
        id: 'invite-1',
        email: 'other@example.com',
        status: 'pending',
        organization_id: 'org-1',
        role_id: 'role-1',
        organization: {
          name: 'Acme Inc',
        },
      });

      await expect(
        service.acceptInvitation('token-123', 'user-1', 'invitee@example.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when user already has an active membership in another organization', async () => {
      mockPrismaService.invitation.findFirst.mockResolvedValueOnce({
        id: 'invite-1',
        email: 'invitee@example.com',
        status: 'pending',
        organization_id: 'org-1',
        role_id: 'role-1',
        organization: {
          name: 'Acme Inc',
        },
      });
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'active-membership',
      });

      await expect(
        service.acceptInvitation('token-123', 'user-1', 'invitee@example.com'),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when user already has an active owner membership', async () => {
      mockPrismaService.invitation.findFirst.mockResolvedValueOnce({
        id: 'invite-1',
        email: 'invitee@example.com',
        status: 'pending',
        organization_id: 'org-1',
        role_id: 'role-1',
        organization: {
          name: 'Acme Inc',
        },
      });
      mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce({
        id: 'membership-owner',
        role: { slug: 'owner' },
      });

      await expect(
        service.acceptInvitation('token-123', 'user-1', 'invitee@example.com'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrismaService.invitation.updateMany).not.toHaveBeenCalled();
      expect(
        mockPrismaService.organizationMembership.create,
      ).not.toHaveBeenCalled();
    });
  });

  describe('listPendingInvitations', () => {
    it('returns pending invitations with role relation for owner/admin users', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockResolvedValueOnce(
        undefined,
      );
      const createdAt = new Date('2026-03-28T10:00:00.000Z');
      mockPrismaService.invitation.findMany.mockResolvedValueOnce([
        {
          id: 'invite-1',
          token: 'token-1',
          email: 'invitee@example.com',
          status: 'pending',
          created_at: createdAt,
          role: {
            id: 'role-1',
            name: 'Agent',
          },
        },
      ]);

      const result = await service.listPendingInvitations('org-1', 'owner-1');

      expect(
        mockAccessVerificationService.verifyIsOwnerOrAdmin,
      ).toHaveBeenCalledWith('org-1', 'owner-1');
      expect(mockPrismaService.invitation.findMany).toHaveBeenCalledWith({
        where: {
          organization_id: 'org-1',
          status: 'pending',
        },
        select: {
          id: true,
          token: true,
          email: true,
          status: true,
          created_at: true,
          role: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      });
      expect(result).toEqual([
        {
          id: 'invite-1',
          token: 'token-1',
          email: 'invitee@example.com',
          status: 'pending',
          created_at: createdAt,
          inviteUrl: 'https://frontend.example.com/invite/token-1',
          role: {
            id: 'role-1',
            name: 'Agent',
          },
        },
      ]);
    });

    it('passes through ForbiddenException when user is not owner/admin/manager', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockRejectedValueOnce(
        new ForbiddenException('auth.ERRORS.INSUFFICIENT_PERMISSIONS'),
      );

      await expect(
        service.listPendingInvitations('org-1', 'member-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets unexpected errors bubble up for global handling', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockResolvedValueOnce(
        undefined,
      );
      mockPrismaService.invitation.findMany.mockRejectedValueOnce(
        new Error('db fail'),
      );

      await expect(
        service.listPendingInvitations('org-1', 'owner-1'),
      ).rejects.toThrow('db fail');
    });
  });
});
