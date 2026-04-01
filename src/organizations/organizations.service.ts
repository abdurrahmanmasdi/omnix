import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../request-context/request-context.service';
import { CreateOrganizationDto } from './dtos/create-organization.dto';
import { UpdateOrganizationDto } from './dtos/update-organization.dto';
import { Prisma } from '@prisma/client';
import { MembershipStatus } from '@prisma/client';
import { OrganizationProvisioningService } from './services/organization-provisioning.service';

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
    private eventEmitter: EventEmitter2,
    private provisioningService: OrganizationProvisioningService,
    private requestContextService: RequestContextService,
  ) {}

  private async emitPermissionCacheClearEvent(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await this.eventEmitter.emitAsync('permissions.cache.clear-user', {
      userId,
      organizationId,
    });
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
      const organization = await this.requestContextService.runWithBypass(() =>
        this.prisma.$transaction(async (tx) => {
          // ========== STEP 1: Validate User ==========
          const user = await tx.user.findUnique({
            where: { id: userId },
          });

          if (!user) {
            this.logger.warn(`User with id ${userId} not found`);
            throw new NotFoundException(
              this.i18n.t('organizations.ERRORS.USER_NOT_FOUND'),
            );
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
              this.i18n.t('organizations.ERRORS.ORG.SLUG_ALREADY_EXISTS'),
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

          await this.provisioningService.provisionDefaultTenantRBAC(
            tx,
            createdOrg.id,
            userId,
          );

          return createdOrg;
        }),
      );

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
        this.i18n.t('organizations.ERRORS.ORG.CREATE_FAILED'),
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
        throw new NotFoundException(
          this.i18n.t('organizations.ERRORS.ORG.NOT_FOUND'),
        );
      }

      return organization as IOrganization;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(`Error fetching organization: ${error}`);
      throw new InternalServerErrorException(
        this.i18n.t('organizations.ERRORS.ORG.FETCH_FAILED'),
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
        throw new NotFoundException(
          this.i18n.t('organizations.ERRORS.ORG.NOT_FOUND'),
        );
      }

      return organization as IOrganization;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(`Error fetching organization by slug: ${error}`);
      throw new InternalServerErrorException(
        this.i18n.t('organizations.ERRORS.ORG.FETCH_FAILED'),
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
          this.i18n.t('auth.ERRORS.VALIDATION.INVALID_PAGINATION'),
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
        this.i18n.t('organizations.ERRORS.ORG.FETCH_PUBLIC_FAILED'),
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
          this.i18n.t('auth.ERRORS.VALIDATION.INVALID_PAGINATION'),
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
        this.i18n.t('organizations.ERRORS.ORG.FETCH_USER_ORGS_FAILED'),
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
            this.i18n.t('organizations.ERRORS.ORG.SLUG_ALREADY_EXISTS'),
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
        this.i18n.t('organizations.ERRORS.ORG.UPDATE_FAILED'),
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
      const affectedUserIds = await this.prisma.$transaction(async (tx) => {
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

        return [...new Set(affectedMemberships.map((m) => m.user_id))];
      });

      // Step 4: Clear cached permissions through event handlers
      if (affectedUserIds.length > 0) {
        await Promise.all(
          affectedUserIds.map((userId) =>
            this.emitPermissionCacheClearEvent(userId, id),
          ),
        );

        this.logger.debug(
          `[OrganizationsService] Emitted permission cache clear events for ${affectedUserIds.length} users from deleted organization ${id}`,
        );
      }

      this.logger.log(
        `Organization ${id} deleted: deactivated ${affectedUserIds.length} memberships and cleared their permission caches`,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(`Error deleting organization: ${error}`);
      throw new InternalServerErrorException(
        this.i18n.t('organizations.ERRORS.ORG.DELETE_FAILED'),
      );
    }
  }
}
