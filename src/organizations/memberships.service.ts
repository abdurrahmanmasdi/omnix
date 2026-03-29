import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { JoinOrganizationDto } from './dtos/join-organization.dto';
import { ApproveMembershipRequestDto } from './dtos/approve-membership-request.dto';
import { MembershipStatus } from '@prisma/client';
import { AccessVerificationService } from '../access-control/access-verification.service';

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(
    private prisma: PrismaService,
    private i18n: I18nService,
    private accessVerificationService: AccessVerificationService,
  ) {}

  /**
   * Returns pending join requests for an organization after validating that
   * the current user has an active membership in the same organization.
   */
  async getPendingRequests(organizationId: string, currentUserId: string) {
    try {
      const activeMembership =
        await this.prisma.organizationMembership.findFirst({
          where: {
            organization_id: organizationId,
            user_id: currentUserId,
            status: {
              // Keep backward compatibility while transitioning from legacy lowercase statuses.
              in: [MembershipStatus.ACTIVE],
            },
          },
          select: { id: true },
        });

      if (!activeMembership) {
        throw new ForbiddenException(this.i18n.t('errors.UNAUTHORIZED_ACCESS'));
      }

      const pendingRequests = await this.prisma.organizationMembership.findMany(
        {
          where: {
            organization_id: organizationId,
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
        },
      );

      return pendingRequests.map((request) => ({
        membershipId: request.id,
        organizationId: request.organization_id,
        status: request.status,
        requestedAt: request.created_at,
        user: {
          id: request.user.id,
          firstName: request.user.first_name,
          lastName: request.user.last_name,
          email: request.user.email,
          createdAt: request.user.created_at,
        },
      }));
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.error(
        `Error fetching pending join requests for organization ${organizationId}: ${error}`,
      );
      throw new InternalServerErrorException(
        this.i18n.t('errors.ORG.FETCH_FAILED'),
      );
    }
  }

  /**
   * Join an organization by slug
   * Creates a membership with status 'PENDING'
   * @throws NotFoundException if organization or user doesn't exist
   * @throws BadRequestException if user is active or already pending
   */
  async join(
    userId: string,
    joinOrgDto: JoinOrganizationDto,
  ): Promise<{ message: string; organizationId: string }> {
    try {
      // Verify user exists
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        this.logger.warn(`User with id ${userId} not found`);
        throw new NotFoundException(this.i18n.t('errors.USER_NOT_FOUND'));
      }

      // Find organization by slug
      const organization = await this.prisma.organization.findUnique({
        where: { slug: joinOrgDto.slug },
      });

      if (!organization) {
        this.logger.warn(
          `Organization with slug '${joinOrgDto.slug}' not found`,
        );
        throw new NotFoundException(this.i18n.t('errors.ORG.NOT_FOUND'));
      }

      // Check if user is already a member
      const existingMembership =
        await this.prisma.organizationMembership.findFirst({
          where: {
            user_id: userId,
            organization_id: organization.id,
          },
        });

      if (existingMembership) {
        const currentStatus = String(existingMembership.status).toUpperCase();

        if (currentStatus === MembershipStatus.ACTIVE) {
          throw new BadRequestException('You are already a member');
        }

        if (currentStatus === MembershipStatus.PENDING) {
          throw new BadRequestException('You already have a pending request');
        }

        if (currentStatus === MembershipStatus.REJECTED) {
          await this.prisma.organizationMembership.update({
            where: { id: existingMembership.id },
            data: {
              status: MembershipStatus.PENDING,
            },
          });

          this.logger.log(
            `User ${userId} re-applied to organization ${organization.id} from REJECTED to PENDING`,
          );

          return {
            message: this.i18n.t('errors.ORG.JOIN_REQUEST_CREATED'),
            organizationId: organization.id,
          };
        }
      }

      // Get or create the 'member' role
      let memberRole = await this.prisma.role.findFirst({
        where: { name: 'member', organization_id: null },
      });

      if (!memberRole) {
        memberRole = await this.prisma.role.create({
          data: {
            name: 'member',
            organization_id: null, // Global role
          },
        });
      }

      // Create membership with PENDING status
      await this.prisma.organizationMembership.create({
        data: {
          user_id: userId,
          organization_id: organization.id,
          role_id: memberRole.id,
          status: MembershipStatus.PENDING,
        },
      });

      this.logger.log(
        `User ${userId} requested to join organization ${organization.id}`,
      );

      return {
        message: this.i18n.t('errors.ORG.JOIN_REQUEST_CREATED'),
        organizationId: organization.id,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error(`Error joining organization: ${error}`);
      throw new InternalServerErrorException(
        this.i18n.t('errors.ORG.JOIN_FAILED'),
      );
    }
  }

  async approveJoinRequest(
    organizationId: string,
    membershipId: string,
    _requesterUserId: string,
    dto: ApproveMembershipRequestDto,
  ): Promise<{ message: string; membershipId: string; status: string }> {
    try {
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) {
        throw new NotFoundException(this.i18n.t('errors.ORG.NOT_FOUND'));
      }

      const role = await this.prisma.role.findUnique({
        where: { id: dto.roleId },
      });

      if (!role || role.organization_id !== organizationId) {
        throw new NotFoundException(this.i18n.t('errors.ORG.ROLE_NOT_FOUND'));
      }

      // Prevent assigning system Owner role directly from approval.
      if (role.slug === 'owner') {
        throw new BadRequestException(
          this.i18n.t('errors.CANNOT_ASSIGN_OWNER_ROLE_FROM_APPROVAL'),
        );
      }

      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          id: membershipId,
          organization_id: organizationId,
          status: MembershipStatus.PENDING,
        },
      });

      if (!membership) {
        throw new NotFoundException('Pending membership request not found.');
      }

      await this.prisma.organizationMembership.update({
        where: { id: membershipId },
        data: {
          status: MembershipStatus.ACTIVE,
          role_id: dto.roleId,
        },
      });

      return {
        message: 'Join request approved successfully.',
        membershipId,
        status: MembershipStatus.ACTIVE,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error(`Error approving join request: ${error}`);
      throw new InternalServerErrorException(
        this.i18n.t('errors.ORG.UPDATE_FAILED'),
      );
    }
  }

  async rejectJoinRequest(
    organizationId: string,
    membershipId: string,
    requesterUserId: string,
  ): Promise<{ message: string; membershipId: string; status: string }> {
    try {
      await this.accessVerificationService.verifyIsOwnerOrAdmin(
        organizationId,
        requesterUserId,
      );

      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) {
        throw new NotFoundException(this.i18n.t('errors.ORG.NOT_FOUND'));
      }

      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          id: membershipId,
          organization_id: organizationId,
          status: MembershipStatus.PENDING,
        },
      });

      if (!membership) {
        throw new NotFoundException('Pending membership request not found.');
      }

      await this.prisma.organizationMembership.update({
        where: { id: membershipId },
        data: { status: MembershipStatus.REJECTED },
      });

      return {
        message: 'Join request rejected successfully.',
        membershipId,
        status: MembershipStatus.REJECTED,
      };
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error(`Error rejecting join request: ${error}`);
      throw new InternalServerErrorException(
        this.i18n.t('errors.ORG.UPDATE_FAILED'),
      );
    }
  }

  /**
   * Get all active members of an organization with their assigned roles.
   *
   * Security: Verifies that the current user has an ACTIVE membership in the organization.
   *
   * @param organizationId - The ID of the organization
   * @param currentUserId - The ID of the user making the request
   * @returns Array of active members with their roles, ordered by firstName
   * @throws ForbiddenException if the current user is not an active member
   * @throws InternalServerErrorException on database errors
   */
  async getOrganizationMembers(organizationId: string, currentUserId: string) {
    try {
      // ========== SECURITY CHECK: Verify current user has ACTIVE membership ==========
      const activeMembership =
        await this.prisma.organizationMembership.findFirst({
          where: {
            organization_id: organizationId,
            user_id: currentUserId,
            status: MembershipStatus.ACTIVE,
          },
          select: { id: true },
        });

      if (!activeMembership) {
        throw new ForbiddenException(this.i18n.t('errors.UNAUTHORIZED_ACCESS'));
      }

      // ========== DATA FETCH: Query active members with their roles ==========
      const members = await this.prisma.organizationMembership.findMany({
        where: {
          organization_id: organizationId,
          status: MembershipStatus.ACTIVE,
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
          role: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: {
          user: {
            first_name: 'asc',
          },
        },
      });

      // ========== TRANSFORM: Map snake_case database fields to camelCase ==========
      return members.map((membership) => ({
        membershipId: membership.id,
        organizationId: membership.organization_id,
        user: {
          id: membership.user.id,
          firstName: membership.user.first_name,
          lastName: membership.user.last_name,
          email: membership.user.email,
          createdAt: membership.user.created_at,
        },
        role: {
          id: membership.role.id,
          name: membership.role.name,
          slug: membership.role.slug,
        },
        status: membership.status,
      }));
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.error(
        `Error fetching organization members for organization ${organizationId}: ${error}`,
      );
      throw new InternalServerErrorException(
        this.i18n.t('errors.ORG.FETCH_FAILED'),
      );
    }
  }
}
