import {
  Injectable,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { InviteToOrganizationDto } from './dtos/invite-organization.dto';
import { MembershipStatus } from '@prisma/client';

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private prisma: PrismaService,
    private i18n: I18nService,
  ) {}

  /**
   * Invite a user to an organization by email
   * Creates (or updates) an invitation record with the selected role
   * @throws NotFoundException if organization doesn't exist
   * @throws ConflictException if user is already a member
   */
  async invite(
    organizationId: string,
    inviteDto: InviteToOrganizationDto,
  ): Promise<{
    message: string;
    invitationId: string;
    status: 'invitation_created' | 'invitation_updated';
  }> {
    try {
      // Verify organization exists
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) {
        this.logger.warn(`Organization with id ${organizationId} not found`);
        throw new NotFoundException(this.i18n.t('errors.ORG.NOT_FOUND'));
      }

      // Verify role exists and belongs to the same organization
      const role = await this.prisma.role.findUnique({
        where: { id: inviteDto.roleId },
      });

      if (!role || role.organization_id !== organizationId) {
        throw new NotFoundException(this.i18n.t('errors.ORG.ROLE_NOT_FOUND'));
      }

      // Check if user exists by email
      const user = await this.prisma.user.findUnique({
        where: { email: inviteDto.email },
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
          this.i18n.t('errors.ORG.USER_ALREADY_MEMBER'),
        );
      }

      const existingInvitation = await this.prisma.invitation.findUnique({
        where: {
          email_organization_id: {
            email: inviteDto.email,
            organization_id: organizationId,
          },
        },
      });

      // Create or update invitation with selected role
      const invitation = await this.prisma.invitation.upsert({
        where: {
          email_organization_id: {
            email: inviteDto.email,
            organization_id: organizationId,
          },
        },
        update: {
          role_id: inviteDto.roleId,
          status: MembershipStatus.PENDING,
          accepted_at: null,
        },
        create: {
          email: inviteDto.email,
          organization_id: organizationId,
          role_id: inviteDto.roleId,
          status: MembershipStatus.PENDING,
        },
      });

      this.logger.log(
        `Invitation ${invitation.id} created/updated for ${inviteDto.email} in organization ${organizationId} with role ${inviteDto.roleId}`,
      );

      return {
        message: this.i18n.t('errors.INVITATION.SAVED'),
        invitationId: invitation.id,
        status: existingInvitation
          ? 'invitation_updated'
          : 'invitation_created',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      this.logger.error(`Error inviting user: ${error}`);
      throw new InternalServerErrorException(
        this.i18n.t('errors.ORG.INVITE_FAILED'),
      );
    }
  }
}
