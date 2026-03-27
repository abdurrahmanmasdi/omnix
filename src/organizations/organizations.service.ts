import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../auth/services/permissions.service';
import { CreateOrganizationDto } from './dtos/create-organization.dto';
import { UpdateOrganizationDto } from './dtos/update-organization.dto';
import { JoinOrganizationDto } from './dtos/join-organization.dto';
import { InviteToOrganizationDto } from './dtos/invite-organization.dto';
import { ApproveMembershipRequestDto } from './dtos/approve-membership-request.dto';
import { DEFAULT_ROLE_MATRIX } from './constants/default-role-matrix';
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
    @Inject(forwardRef(() => PermissionsService))
    private permissionsService: PermissionsService,
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
   * Create a new organization with default roles and permissions
   *
   * This method performs the following in a single transaction:
   * 1. Creates the organization
   * 2. Fetches all global permissions from the database
   * 3. Creates default roles (Owner, Manager, Agent) with their permissions
   * 4. Assigns the creator as Owner with ACTIVE status
   *
   * The transaction ensures that if anything fails, the organization is not created,
   * preventing orphaned data.
   *
   * @throws ConflictException if slug already exists
   * @throws NotFoundException if user doesn't exist
   * @throws InternalServerErrorException on database errors
   */
  async create(
    userId: string,
    createOrgDto: CreateOrganizationDto,
  ): Promise<IOrganization> {
    try {
      const organization = await this.prisma.$transaction(async (tx) => {
        // ========== STEP 1: Validate User ==========
        const user = await tx.user.findUnique({
          where: { id: userId },
        });

        if (!user) {
          this.logger.warn(`User with id ${userId} not found`);
          throw new NotFoundException(this.i18n.t('errors.USER_NOT_FOUND'));
        }

        // ========== STEP 2: Validate Slug Availability ==========
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

        // ========== STEP 3: Create Organization ==========
        const createdOrg = await tx.organization.create({
          data: {
            name: createOrgDto.name,
            slug: createOrgDto.slug,
            is_public: createOrgDto.is_public ?? false,
          },
        });

        // ========== STEP 5: FETCH ALL PERMISSIONS WITH SAFETY CHECK ==========
        const allPermissions = await tx.permission.findMany();

        const permissionMap = new Map(
          allPermissions.map((p) => [p.action, p.id]),
        );
        // ========== STEP 6: CREATE OWNER ROLE WITH ALL PERMISSIONS ==========
        // Owner role gets ALL system permissions in a single atomic create operation
        const ownerTranslations = { en: 'Owner', ar: 'المالك' };
        const ownerRole = await tx.role.create({
          data: {
            name: 'Kurucu',
            ...(ownerTranslations && {
              name_translations: ownerTranslations as Prisma.InputJsonValue,
            }),
            organization_id: createdOrg.id,
            rolePermissions: {
              create: allPermissions.map((perm) => ({
                permission_id: perm.id,
              })),
            },
          },
          include: { rolePermissions: true },
        });

        // ========== STEP 7: CREATE OTHER ROLES (MANAGER, AGENT) WITH MATRIX PERMISSIONS ==========
        // Create remaining roles from the matrix (excluding Owner which we just created)
        // Map Turkish role names to their English and Arabic translations
        const roleTranslations: Record<string, { en: string; ar: string }> = {
          Yönetici: { en: 'Manager', ar: 'مدير' },
          Temsilci: { en: 'Agent', ar: 'وكيل' },
        };

        await Promise.all(
          DEFAULT_ROLE_MATRIX.filter((role) => role.name !== 'Kurucu').map(
            async (roleTemplate) => {
              // Get translations for this role
              const translations = roleTranslations[roleTemplate.name];

              // Create the role
              const role = await tx.role.create({
                data: {
                  name: roleTemplate.name,
                  ...(translations && {
                    name_translations: translations,
                  }),
                  organization_id: createdOrg.id,
                },
              });

              // Map permission actions to permission IDs from the matrix
              const rolePermissions = roleTemplate.permissionActions
                .map((action) => permissionMap.get(action))
                .filter((id) => id !== undefined);

              // Batch create RolePermission join records
              if (rolePermissions.length > 0) {
                await tx.rolePermission.createMany({
                  data: rolePermissions.map((permissionId) => ({
                    role_id: role.id,
                    permission_id: permissionId,
                  })),
                  skipDuplicates: true,
                });
              }

              return role;
            },
          ),
        );

        // ========== STEP 8: Assign Creator as Owner with ACTIVE Status ==========
        await tx.organizationMembership.create({
          data: {
            user_id: userId,
            organization_id: createdOrg.id,
            role_id: ownerRole.id,
            status: MembershipStatus.ACTIVE,
          },
        });

        return createdOrg;
      });

      this.logger.log(
        `Organization '${organization.slug}' created by user ${userId} ` +
          `with Owner membership and 3 default roles (Owner, Manager, Agent) ` +
          `with permissions assigned`,
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
   *
   * This method performs the following in a single transaction:
   * 1. Verifies the organization exists
   * 2. Queries all active memberships to capture user IDs
   * 3. Updates all memberships to REJECTED status (deactivation)
   * 4. Clears Redis permission cache for all affected users
   *
   * This ensures that when an organization is deleted, users can no longer
   * make API calls using stale cached permissions.
   *
   * @param id - Organization ID to delete
   * @throws NotFoundException if organization doesn't exist
   * @throws InternalServerErrorException on database or cache errors
   */
  async remove(id: string): Promise<void> {
    try {
      // Step 1: Verify organization exists
      await this.findById(id);

      // Step 2 & 3: Deactivate all memberships in a transaction
      const affectedMembershipCount = await this.prisma.$transaction(
        async (tx) => {
          // Query all memberships before deactivation to capture user IDs
          const affectedMemberships = await tx.organizationMembership.findMany({
            where: { organization_id: id },
            select: { user_id: true },
          });

          // Update all memberships to REJECTED status (deactivation)
          await tx.organizationMembership.updateMany({
            where: { organization_id: id },
            data: { status: MembershipStatus.REJECTED },
          });

          // Step 4: Clear Redis cache for all affected users
          if (affectedMemberships.length > 0) {
            await Promise.all(
              affectedMemberships.map((membership) =>
                this.permissionsService.clearUserPermissionsCache(
                  membership.user_id,
                  id,
                ),
              ),
            );

            this.logger.debug(
              `[OrganizationsService] Cleared permissions cache for ${affectedMemberships.length} users from deleted organization ${id}`,
            );
          }

          return affectedMemberships.length;
        },
      );

      this.logger.log(
        `Organization ${id} deleted: deactivated ${affectedMembershipCount} memberships and cleared their permission caches`,
      );
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

      // Prevent assigning Owner (Kurucu) role directly from approval
      if (role.name === 'Kurucu') {
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
            },
          },
          role: {
            select: {
              id: true,
              name: true,
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
        },
        role: {
          id: membership.role.id,
          name: membership.role.name,
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
