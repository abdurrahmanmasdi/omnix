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
  deleted_at?: Date | null;
  tax_number?: string | null;
  tax_office?: string | null;
  logo_url?: string | null;
  brand_colors?: Record<string, string> | null;
  default_currency: string;
  industry_category?: string | null;
  address?: string | null;
  website_url?: string | null;
  public_email?: string | null;
  public_phone?: string | null;
  terms_and_conditions?: string | null;
  privacy_policy?: string | null;
  bank_accounts?: any[];
  social_links?: any[];
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

  private generateSlug(name: string): string {
    const baseSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    const randomHash = Math.random().toString(36).substring(2, 8);
    return `${baseSlug}-${randomHash}`;
  }

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
   * 1. Validates user existence
   * 2. Generates a unique slug from organization name
   * 3. Creates the organization with white-label and privacy fields
   * 4. Fetches all global permissions from the database
   * 5. Creates default roles (Owner, Manager, Agent) with their permissions
   * 6. Assigns the creator as Owner with ACTIVE status
   *
   * The transaction ensures that if anything fails, the organization is not created,
   * preventing orphaned data.
   *
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

          // ========== STEP 2: Generate Slug ==========
          const slug = this.generateSlug(createOrgDto.name);

          // Check for slug uniqueness
          const existingOrg = await tx.organization.findUnique({
            where: { slug: slug },
          });

          if (existingOrg) {
            this.logger.warn(`Organization with slug '${slug}' already exists`);
            throw new ConflictException(
              this.i18n.t('organizations.ERRORS.ORG.SLUG_ALREADY_EXISTS'),
            );
          }

          // ========== STEP 3: Create Organization ==========
          const createdOrg = await tx.organization.create({
            data: {
              name: createOrgDto.name,
              slug: slug,
              is_public: createOrgDto.is_public ?? false,
              tax_number: createOrgDto.tax_number,
              tax_office: createOrgDto.tax_office,
              logo_url: createOrgDto.logo_url,
              brand_colors: createOrgDto.brand_colors
                ? createOrgDto.brand_colors
                : undefined,
              default_currency: createOrgDto.default_currency || 'USD',
              industry_category: createOrgDto.industry_category,
              address: createOrgDto.address,
              website_url: createOrgDto.website_url,
              public_email: createOrgDto.public_email,
              public_phone: createOrgDto.public_phone,
              terms_and_conditions: createOrgDto.terms_and_conditions,
              privacy_policy: createOrgDto.privacy_policy,
              social_links: createOrgDto.social_links?.length
                ? {
                    create: createOrgDto.social_links.map((link) => ({
                      platform: link.platform,
                      url: link.url,
                    })),
                  }
                : undefined,
              bank_accounts: createOrgDto.bank_accounts?.length
                ? {
                    create: createOrgDto.bank_accounts.map((bank) => ({
                      bank_name: bank.bank_name,
                      iban: bank.iban,
                      account_holder_name: bank.account_holder_name,
                      currency: bank.currency || 'USD',
                      is_default: bank.is_default || false,
                    })),
                  }
                : undefined,
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
        include: { bank_accounts: true, social_links: true },
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
        include: { bank_accounts: true, social_links: true },
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
   */
  async update(
    id: string,
    updateOrgDto: UpdateOrganizationDto,
  ): Promise<IOrganization> {
    try {
      // Verify organization exists
      await this.findById(id);

      const updated = await this.prisma.organization.update({
        where: { id },
        data: {
          ...(updateOrgDto.name && { name: updateOrgDto.name }),
          ...(updateOrgDto.is_public !== undefined && {
            is_public: updateOrgDto.is_public,
          }),
          ...(updateOrgDto.tax_number !== undefined && { tax_number: updateOrgDto.tax_number }),
          ...(updateOrgDto.tax_office !== undefined && { tax_office: updateOrgDto.tax_office }),
          ...(updateOrgDto.logo_url !== undefined && { logo_url: updateOrgDto.logo_url }),
          ...(updateOrgDto.brand_colors !== undefined && { brand_colors: updateOrgDto.brand_colors }),
          ...(updateOrgDto.default_currency !== undefined && { default_currency: updateOrgDto.default_currency }),
          ...(updateOrgDto.industry_category !== undefined && { industry_category: updateOrgDto.industry_category }),
          ...(updateOrgDto.address !== undefined && { address: updateOrgDto.address }),
          ...(updateOrgDto.website_url !== undefined && { website_url: updateOrgDto.website_url }),
          ...(updateOrgDto.public_email !== undefined && { public_email: updateOrgDto.public_email }),
          ...(updateOrgDto.public_phone !== undefined && { public_phone: updateOrgDto.public_phone }),
          ...(updateOrgDto.terms_and_conditions !== undefined && { terms_and_conditions: updateOrgDto.terms_and_conditions }),
          ...(updateOrgDto.privacy_policy !== undefined && { privacy_policy: updateOrgDto.privacy_policy }),
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
