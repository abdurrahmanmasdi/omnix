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
import { CreateOrganizationDto } from './dtos/create-organization.dto';
import { UpdateOrganizationDto } from './dtos/update-organization.dto';
import { JoinOrganizationDto } from './dtos/join-organization.dto';
import { InviteToOrganizationDto } from './dtos/invite-organization.dto';
import { ApproveMembershipRequestDto } from './dtos/approve-membership-request.dto';
import { Prisma } from '@prisma/client';
import { MembershipStatus } from '@prisma/client';

interface IOrganization {
  id: string;
  name: string;
  slug: string;
  is_public: boolean;
  created_at: Date;
}

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private prisma: PrismaService,
    private i18n: I18nService,
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
   * Create a new organization
   * Automatically creates an OrganizationMembership for the creator with role 'Admin' and status 'active'
   * @throws ConflictException if slug already exists
   * @throws InternalServerErrorException on database errors
   */
  async create(
    userId: string,
    createOrgDto: CreateOrganizationDto,
  ): Promise<IOrganization> {
    try {
      const organization = await this.prisma.$transaction(async (tx) => {
        // Validate that user exists
        const user = await tx.user.findUnique({
          where: { id: userId },
        });

        if (!user) {
          this.logger.warn(`User with id ${userId} not found`);
          throw new NotFoundException(this.i18n.t('errors.USER_NOT_FOUND'));
        }

        // Check if slug is already in use
        const existingOrg = await tx.organization.findUnique({
          where: { slug: createOrgDto.slug },
        });

        if (existingOrg) {
          this.logger.warn(
            `Organization with slug '${createOrgDto.slug}' already exists`,
          );
          throw new ConflictException(
            this.i18n.t('errors.ORG.SLUG_ALREADY_EXISTS'),
          );
        }

        // 1) Create organization
        const createdOrg = await tx.organization.create({
          data: {
            name: createOrgDto.name,
            slug: createOrgDto.slug,
            is_public: createOrgDto.is_public ?? false,
          },
        });

        // 2) Create default tenant roles
        const [adminRole, managerRole, agentRole] = await Promise.all([
          tx.role.create({
            data: {
              name: 'Admin',
              organization_id: createdOrg.id,
            },
          }),
          tx.role.create({
            data: {
              name: 'Manager',
              organization_id: createdOrg.id,
            },
          }),
          tx.role.create({
            data: {
              name: 'Agent',
              organization_id: createdOrg.id,
            },
          }),
        ]);

        // 3) Assign creator as active member with Admin role
        await tx.organizationMembership.create({
          data: {
            user_id: userId,
            organization_id: createdOrg.id,
            role_id: adminRole.id,
            status: MembershipStatus.ACTIVE,
          },
        });

        return createdOrg;
      });

      this.logger.log(
        `Organization '${organization.slug}' created by user ${userId} with Admin membership`,
      );

      return organization as IOrganization;
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      // Handle Prisma errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        this.logger.error(`Prisma error: ${error.message}`);
        if (error.code === 'P2002') {
          throw new ConflictException(
            'A resource with this identifier already exists',
          );
        }
      }

      this.logger.error(`Error creating organization: ${error}`);
      throw new InternalServerErrorException(
        this.i18n.t('errors.ORG.CREATE_FAILED'),
      );
    }
  }

  /**
   * Get organization by ID
   * @throws NotFoundException if organization doesn't exist
   */
  async findById(id: string): Promise<IOrganization> {
    try {
      const organization = await this.prisma.organization.findUnique({
        where: { id },
      });

      if (!organization) {
        this.logger.warn(`Organization with id ${id} not found`);
        throw new NotFoundException(this.i18n.t('errors.ORG.NOT_FOUND'));
      }

      return organization as IOrganization;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(`Error fetching organization: ${error}`);
      throw new InternalServerErrorException(
        this.i18n.t('errors.ORG.FETCH_FAILED'),
      );
    }
  }

  /**
   * Get organization by slug
   * @throws NotFoundException if organization doesn't exist
   */
  async findBySlug(slug: string): Promise<IOrganization> {
    try {
      const organization = await this.prisma.organization.findUnique({
        where: { slug },
      });

      if (!organization) {
        this.logger.warn(`Organization with slug '${slug}' not found`);
        throw new NotFoundException(this.i18n.t('errors.ORG.NOT_FOUND'));
      }

      return organization as IOrganization;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(`Error fetching organization by slug: ${error}`);
      throw new InternalServerErrorException(
        this.i18n.t('errors.ORG.FETCH_FAILED'),
      );
    }
  }

  /**
   * Get all public organizations with pagination
   * @throws InternalServerErrorException on database errors
   */
  async findAllPublic(
    skip: number = 0,
    take: number = 10,
  ): Promise<{ organizations: IOrganization[]; total: number }> {
    try {
      if (skip < 0 || take < 1 || take > 100) {
        throw new BadRequestException(
          this.i18n.t('errors.VALIDATION.INVALID_PAGINATION'),
        );
      }

      const [organizations, total] = await Promise.all([
        this.prisma.organization.findMany({
          where: { is_public: true },
          skip,
          take,
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.organization.count({ where: { is_public: true } }),
      ]);

      return {
        organizations: organizations as IOrganization[],
        total,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(`Error fetching public organizations: ${error}`);
      throw new InternalServerErrorException(
        this.i18n.t('errors.ORG.FETCH_PUBLIC_FAILED'),
      );
    }
  }

  /**
   * Get user's organizations
   * @throws InternalServerErrorException on database errors
   */
  async findUserOrganizations(
    userId: string,
    skip: number = 0,
    take: number = 10,
  ): Promise<{ organizations: IOrganization[]; total: number }> {
    try {
      if (skip < 0 || take < 1 || take > 100) {
        throw new BadRequestException(
          this.i18n.t('errors.VALIDATION.INVALID_PAGINATION'),
        );
      }

      const [organizations, total] = await Promise.all([
        this.prisma.organization.findMany({
          where: {
            memberships: {
              some: { user_id: userId, status: MembershipStatus.ACTIVE },
            },
          },
          skip,
          take,
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.organization.count({
          where: {
            memberships: {
              some: { user_id: userId, status: MembershipStatus.ACTIVE },
            },
          },
        }),
      ]);

      return {
        organizations: organizations as IOrganization[],
        total,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(
        `Error fetching user organizations for ${userId}: ${error}`,
      );
      throw new InternalServerErrorException(
        this.i18n.t('errors.ORG.FETCH_USER_ORGS_FAILED'),
      );
    }
  }

  /**
   * Update organization
   * @throws NotFoundException if organization doesn't exist
   * @throws ConflictException if new slug is already taken
   */
  async update(
    id: string,
    updateOrgDto: UpdateOrganizationDto,
  ): Promise<IOrganization> {
    try {
      // Verify organization exists
      const organization = await this.findById(id);

      // If slug is being changed, check if it's available
      if (updateOrgDto.slug && updateOrgDto.slug !== organization.slug) {
        const existingOrg = await this.prisma.organization.findUnique({
          where: { slug: updateOrgDto.slug },
        });

        if (existingOrg) {
          this.logger.warn(
            `Organization with slug '${updateOrgDto.slug}' already exists`,
          );
          throw new ConflictException(
            this.i18n.t('errors.ORG.SLUG_ALREADY_EXISTS'),
          );
        }
      }

      const updated = await this.prisma.organization.update({
        where: { id },
        data: {
          ...(updateOrgDto.name && { name: updateOrgDto.name }),
          ...(updateOrgDto.slug && { slug: updateOrgDto.slug }),
          ...(updateOrgDto.is_public !== undefined && {
            is_public: updateOrgDto.is_public,
          }),
        },
      });

      this.logger.log(`Organization ${id} updated`);

      return updated as IOrganization;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      this.logger.error(`Error updating organization: ${error}`);
      throw new InternalServerErrorException(
        this.i18n.t('errors.ORG.UPDATE_FAILED'),
      );
    }
  }

  /**
   * Delete organization (soft delete via membership deactivation)
   * @throws NotFoundException if organization doesn't exist
   */
  async remove(id: string): Promise<void> {
    try {
      // Verify organization exists
      await this.findById(id);

      // TODO: Implement proper deletion strategy
      // For now, deactivate all memberships
      await this.prisma.organizationMembership.deleteMany({
        where: { organization_id: id },
      });

      this.logger.log(`Organization ${id} deleted`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(`Error deleting organization: ${error}`);
      throw new InternalServerErrorException(
        this.i18n.t('errors.ORG.DELETE_FAILED'),
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
    _requesterUserId: string,
  ): Promise<{ message: string; membershipId: string; status: string }> {
    try {
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
