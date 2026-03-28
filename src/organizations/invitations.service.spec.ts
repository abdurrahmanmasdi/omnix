import {
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

describe('InvitationsService', () => {
  let service: InvitationsService;

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
    },
    invitation: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const mockI18nService = {
    t: jest.fn((key: string) => key),
  };

  const mockAccessVerificationService = {
    verifyIsOwnerOrAdmin: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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
      ],
    }).compile();

    service = module.get<InvitationsService>(InvitationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('invite', () => {
    const inviteDto = { email: 'new@user.com', roleId: 'role-1' };

    it('passes through ForbiddenException for unauthorized caller', async () => {
      mockAccessVerificationService.verifyIsOwnerOrAdmin.mockRejectedValueOnce(
        new ForbiddenException('errors.INSUFFICIENT_PERMISSIONS'),
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

    it('throws NotFoundException when role belongs to another organization', async () => {
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

      await expect(
        service.invite('org-1', 'caller-1', inviteDto),
      ).rejects.toThrow(NotFoundException);
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

    it('returns invitation_created when no existing invitation found', async () => {
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
      mockPrismaService.invitation.upsert.mockResolvedValueOnce({
        id: 'invite-1',
      });

      const result = await service.invite('org-1', 'caller-1', inviteDto);

      expect(result).toEqual({
        message: 'errors.INVITATION.SAVED',
        invitationId: 'invite-1',
        status: 'invitation_created',
      });
    });

    it('returns invitation_updated when existing invitation exists', async () => {
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
      mockPrismaService.invitation.findUnique.mockResolvedValueOnce({
        id: 'existing-invite',
      });
      mockPrismaService.invitation.upsert.mockResolvedValueOnce({
        id: 'existing-invite',
      });

      const result = await service.invite('org-1', 'caller-1', inviteDto);

      expect(result.status).toBe('invitation_updated');
    });

    it('maps unexpected errors to InternalServerErrorException', async () => {
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
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
