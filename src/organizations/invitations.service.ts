import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../request-context/request-context.service';
import { InviteToOrganizationDto } from './dtos/invite-organization.dto';
import { AccessVerificationService } from '../access-control/access-verification.service';
import { INVITATION_STATUS } from '../constants/invitation-status';

interface InvitationIdOnly {
  id: string;
}

interface InvitationPreviewRecord {
  email: string;
  status: string;
  organization: {
    name: string;
  };
  role: {
    name: string;
  };
}

interface InvitationAcceptanceRecord {
  id: string;
  email: string;
  status: string;
  organization_id: string;
  role_id: string;
  organization: {
    name: string;
  };
}

interface PendingInvitationListRecord {
  id: string;
  token: string;
  email: string;
  status: string;
  created_at: Date;
  inviteUrl: string;
  role: {
    id: string;
    name: string;
  };
}

interface PendingInvitationDbRecord {
  id: string;
  token: string;
  email: string;
  status: string;
  created_at: Date;
  role: {
    id: string;
    name: string;
  };
}

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);
  private readonly INVITATION_TOKEN_BYTES = 32;
  private readonly MAX_TOKEN_GENERATION_ATTEMPTS = 5;

  constructor(
    private prisma: PrismaService,
    private i18n: I18nService,
    private accessVerificationService: AccessVerificationService,
    private requestContextService: RequestContextService,
  ) {}

  private generateToken(): string {
    return randomBytes(this.INVITATION_TOKEN_BYTES).toString('hex');
  }

  private buildInviteUrl(token: string): string {
    const frontendUrl = (process.env.FRONTEND_URL ?? 'http://localhost:3001')
      .trim()
      .replace(/\/+$/, '');
    return `${frontendUrl}/invite/${token}`;
  }

  private async generateUniqueToken(): Promise<string> {
    for (
      let attempt = 0;
      attempt < this.MAX_TOKEN_GENERATION_ATTEMPTS;
      attempt++
    ) {
      const token = this.generateToken();

      const existingToken = (await this.prisma.invitation.findUnique({
        where: { token } as unknown as never,
        select: { id: true },
      })) as InvitationIdOnly | null;

      if (!existingToken) {
        return token;
      }
    }

    throw new InternalServerErrorException(
      this.i18n.t('organizations.ERRORS.ORG.INVITE_FAILED'),
    );
  }

  private validateInvitationForEmail(
    invitation: InvitationAcceptanceRecord | null,
    email: string,
  ): InvitationAcceptanceRecord {
    if (!invitation) {
      throw new NotFoundException(
        this.i18n.t('organizations.ERRORS.INVITATION.NOT_FOUND'),
      );
    }

    if (invitation.status !== INVITATION_STATUS.PENDING) {
      throw new BadRequestException(
        this.i18n.t('organizations.ERRORS.INVITATION.INVALID_STATUS', {
          args: { status: invitation.status },
        }),
      );
    }

    if (invitation.email.toLowerCase() !== email.toLowerCase()) {
      throw new BadRequestException(
        this.i18n.t('organizations.ERRORS.INVITATION.NOT_OWNER'),
      );
    }

    return invitation;
  }

  /**
   * Invite a user to an organization by email
   * Creates (or updates) an invitation record with the selected role
   * @throws NotFoundException if organization doesn't exist
   * @throws ConflictException if user is already a member
   */
  async invite(
    organizationId: string,
    currentUserId: string,
    inviteDto: InviteToOrganizationDto,
  ): Promise<{
    inviteUrl: string;
    token: string;
  }> {
    this.logger.log(
      `[InvitationsService] Creating invitation for ${inviteDto.email} in organization ${organizationId}`,
    );

    await this.accessVerificationService.verifyIsOwnerOrAdmin(
      organizationId,
      currentUserId,
    );

    return this.requestContextService.runWithBypass(async () => {
      // Verify organization exists
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) {
        this.logger.warn(`Organization with id ${organizationId} not found`);
        throw new NotFoundException(
          this.i18n.t('organizations.ERRORS.ORG.NOT_FOUND'),
        );
      }

      // Verify role exists and belongs to the same organization
      const role = await this.prisma.role.findUnique({
        where: { id: inviteDto.roleId },
      });

      if (!role || role.organization_id !== organizationId) {
        throw new BadRequestException(
          'Invalid role specified for this organization.',
        );
      }

      // Check if user exists by email
      const user = await this.prisma.user.findFirst({
        where: {
          email: inviteDto.email,
          deleted_at: null,
        },
      });

      // Check if user is already a member
      const existingMembership = user
        ? await this.prisma.organizationMembership.findFirst({
            where: {
              user_id: user.id,
              organization_id: organizationId,
            },
          })
        : null;

      if (existingMembership) {
        this.logger.warn(
          `User ${user?.id ?? 'unknown'} is already a member of organization ${organizationId}`,
        );
        throw new ConflictException(
          this.i18n.t('organizations.ERRORS.ORG.USER_ALREADY_MEMBER'),
        );
      }

      const token = await this.generateUniqueToken();

      let invitation: InvitationIdOnly;

      // Create or update invitation with selected role. Log raw Prisma errors and rethrow.
      try {
        invitation = (await this.prisma.invitation.upsert({
          where: {
            email_organization_id: {
              email: inviteDto.email,
              organization_id: organizationId,
            },
          },
          update: {
            role_id: inviteDto.roleId,
            token,
            status: INVITATION_STATUS.PENDING,
            accepted_at: null,
          } as unknown as never,
          create: {
            email: inviteDto.email,
            organization_id: organizationId,
            role_id: inviteDto.roleId,
            token,
            status: INVITATION_STATUS.PENDING,
          } as unknown as never,
        })) as InvitationIdOnly;
      } catch (error) {
        this.logger.log(
          `[InvitationsService] Invitation upsert failed ${error instanceof Error ? error.stack : String(error)}`,
        );
        this.logger.error(
          '[InvitationsService] Invitation upsert failed',
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }

      this.logger.log(
        `Invitation ${invitation.id} created/updated for ${inviteDto.email} in organization ${organizationId} with role ${inviteDto.roleId}`,
      );

      return {
        token,
        inviteUrl: this.buildInviteUrl(token),
      };
    });
  }

  async getInvitationByToken(token: string): Promise<{
    organizationName: string;
    roleName: string;
    email: string;
    status: string;
  }> {
    try {
      const invitation = (await this.requestContextService.runWithBypass(() =>
        this.prisma.invitation.findUnique({
          where: { token } as unknown as never,
          select: {
            email: true,
            status: true,
            organization: {
              select: {
                name: true,
              },
            },
            role: {
              select: {
                name: true,
              },
            },
          },
        }),
      )) as InvitationPreviewRecord | null;

      if (!invitation) {
        throw new NotFoundException(
          this.i18n.t('organizations.ERRORS.INVITATION.NOT_FOUND'),
        );
      }

      return {
        organizationName: invitation.organization.name,
        roleName: invitation.role.name,
        email: invitation.email,
        status: invitation.status,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(`Error fetching invitation by token: ${error}`);
      throw new InternalServerErrorException(
        this.i18n.t('organizations.ERRORS.ORG.INVITE_FAILED'),
      );
    }
  }

  async acceptInvitation(
    token: string,
    userId: string,
    userEmail: string,
  ): Promise<{
    message: string;
    organizationId: string;
    membershipId: string;
  }> {
    try {
      return await this.requestContextService.runWithBypass(() =>
        this.prisma.$transaction(async (tx) => {
          const invitation = (await tx.invitation.findFirst({
            where: { token } as unknown as never,
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
          })) as InvitationAcceptanceRecord | null;

          const validInvitation = this.validateInvitationForEmail(
            invitation,
            userEmail,
          );

          const existingActiveMembership =
            await tx.organizationMembership.findFirst({
              where: {
                user_id: userId,
                status: MembershipStatus.ACTIVE,
              },
              select: { id: true },
            });

          if (existingActiveMembership) {
            throw new ConflictException(
              this.i18n.t('organizations.ERRORS.ORG.USER_ALREADY_MEMBER'),
            );
          }

          const invitationUpdate = await tx.invitation.updateMany({
            where: {
              id: validInvitation.id,
              status: INVITATION_STATUS.PENDING,
            },
            data: {
              status: INVITATION_STATUS.ACCEPTED,
              accepted_at: new Date(),
            },
          });

          if (invitationUpdate.count !== 1) {
            throw new BadRequestException(
              this.i18n.t('organizations.ERRORS.INVITATION.INVALID_STATUS', {
                args: { status: validInvitation.status },
              }),
            );
          }

          const membership = await tx.organizationMembership.create({
            data: {
              user_id: userId,
              organization_id: validInvitation.organization_id,
              role_id: validInvitation.role_id,
              status: MembershipStatus.ACTIVE,
            },
            select: {
              id: true,
            },
          });

          return {
            message: this.i18n.t(
              'organizations.ERRORS.INVITATION.ACCEPT_SUCCESS',
              {
                args: {
                  organizationName: validInvitation.organization.name,
                },
              },
            ),
            organizationId: validInvitation.organization_id,
            membershipId: membership.id,
          };
        }),
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      this.logger.error(`Error accepting invitation: ${error}`);
      throw new InternalServerErrorException(
        this.i18n.t('organizations.ERRORS.ORG.INVITE_FAILED'),
      );
    }
  }

  async listPendingInvitations(
    organizationId: string,
    currentUserId: string,
  ): Promise<PendingInvitationListRecord[]> {
    await this.accessVerificationService.verifyIsOwnerOrAdmin(
      organizationId,
      currentUserId,
    );

    const pendingInvites = (await this.prisma.invitation.findMany({
      where: {
        organization_id: organizationId,
        status: INVITATION_STATUS.PENDING,
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
    } as unknown as never)) as unknown as PendingInvitationDbRecord[];

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

    return pendingInvites.map((invite) => ({
      ...invite,
      inviteUrl: `${baseUrl}/invite/${invite.token}`,
    }));
  }
}
