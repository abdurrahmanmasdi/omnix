import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dtos/create-organization.dto';
import { UpdateOrganizationDto } from './dtos/update-organization.dto';
import { JoinOrganizationDto } from './dtos/join-organization.dto';
import { InviteToOrganizationDto } from './dtos/invite-organization.dto';
import { Prisma } from '@prisma/client';

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

  constructor(private prisma: PrismaService) {}

  /**
   * Create a new organization
   * Automatically creates an OrganizationMembership for the creator with role 'owner' and status 'active'
   * @throws ConflictException if slug already exists
   * @throws InternalServerErrorException on database errors
   */
  async create(
    userId: string,
    createOrgDto: CreateOrganizationDto,
  ): Promise<IOrganization> {
    try {
      // Validate that user exists
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        this.logger.warn(`User with id ${userId} not found`);
        throw new NotFoundException('User not found');
      }

      // Check if slug is already in use
      const existingOrg = await this.prisma.organization.findUnique({
        where: { slug: createOrgDto.slug },
      });

      if (existingOrg) {
        this.logger.warn(
          `Organization with slug '${createOrgDto.slug}' already exists`,
        );
        throw new ConflictException(
          `Organization with slug '${createOrgDto.slug}' already exists`,
        );
      }

      // Get or create the 'owner' role for this organization
      let ownerRole = await this.prisma.role.findFirst({
        where: { name: 'owner', organization_id: null },
      });

      if (!ownerRole) {
        ownerRole = await this.prisma.role.create({
          data: {
            name: 'owner',
            organization_id: null, // Global role
          },
        });
      }

      // Create organization and membership in a transaction
      const organization = await this.prisma.organization.create({
        data: {
          name: createOrgDto.name,
          slug: createOrgDto.slug,
          is_public: createOrgDto.is_public ?? false,
          memberships: {
            create: {
              user_id: userId,
              role_id: ownerRole.id,
              status: 'active',
            },
          },
        },
      });

      this.logger.log(
        `Organization '${organization.slug}' created by user ${userId} with owner membership`,
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
        'Failed to create organization. Please try again later.',
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
        throw new NotFoundException(`Organization with id '${id}' not found`);
      }

      return organization as IOrganization;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(`Error fetching organization: ${error}`);
      throw new InternalServerErrorException(
        'Failed to fetch organization. Please try again later.',
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
          `Organization with slug '${slug}' not found`,
        );
      }

      return organization as IOrganization;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(`Error fetching organization by slug: ${error}`);
      throw new InternalServerErrorException(
        'Failed to fetch organization. Please try again later.',
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
          'Invalid pagination parameters. skip must be >= 0, take must be between 1 and 100',
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
        'Failed to fetch organizations. Please try again later.',
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
          'Invalid pagination parameters. skip must be >= 0, take must be between 1 and 100',
        );
      }

      const [organizations, total] = await Promise.all([
        this.prisma.organization.findMany({
          where: {
            memberships: {
              some: { user_id: userId, status: 'active' },
            },
          },
          skip,
          take,
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.organization.count({
          where: {
            memberships: {
              some: { user_id: userId, status: 'active' },
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
        'Failed to fetch organizations. Please try again later.',
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
            `Organization with slug '${updateOrgDto.slug}' already exists`,
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
        'Failed to update organization. Please try again later.',
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
      await this.prisma.organizationMembership.updateMany({
        where: { organization_id: id },
        data: { status: 'inactive' },
      });

      this.logger.log(`Organization ${id} deleted`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(`Error deleting organization: ${error}`);
      throw new InternalServerErrorException(
        'Failed to delete organization. Please try again later.',
      );
    }
  }

  /**
   * Join an organization by slug
   * Creates a membership with status 'pending_approval'
   * @throws NotFoundException if organization or user doesn't exist
   * @throws ConflictException if user is already a member
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
        throw new NotFoundException('User not found');
      }

      // Find organization by slug
      const organization = await this.prisma.organization.findUnique({
        where: { slug: joinOrgDto.slug },
      });

      if (!organization) {
        this.logger.warn(
          `Organization with slug '${joinOrgDto.slug}' not found`,
        );
        throw new NotFoundException(
          `Organization with slug '${joinOrgDto.slug}' not found`,
        );
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
        this.logger.warn(
          `User ${userId} is already a member of organization ${organization.id}`,
        );
        throw new ConflictException(
          'User is already a member of this organization',
        );
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

      // Create membership with pending_approval status
      await this.prisma.organizationMembership.create({
        data: {
          user_id: userId,
          organization_id: organization.id,
          role_id: memberRole.id,
          status: 'pending_approval',
        },
      });

      this.logger.log(
        `User ${userId} requested to join organization ${organization.id}`,
      );

      return {
        message: 'Join request created successfully. Awaiting approval.',
        organizationId: organization.id,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      this.logger.error(`Error joining organization: ${error}`);
      throw new InternalServerErrorException(
        'Failed to join organization. Please try again later.',
      );
    }
  }

  /**
   * Invite a user to an organization by email
   * Creates a new user account if email doesn't exist
   * Creates a membership with status 'invited'
   * @throws NotFoundException if organization doesn't exist
   * @throws ConflictException if user is already a member
   */
  async invite(
    organizationId: string,
    inviteDto: InviteToOrganizationDto,
  ): Promise<{
    message: string;
    userId: string;
    status: 'new_user_created' | 'existing_user_invited';
  }> {
    try {
      // Verify organization exists
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) {
        this.logger.warn(`Organization with id ${organizationId} not found`);
        throw new NotFoundException('Organization not found');
      }

      // Check if user exists by email
      let user = await this.prisma.user.findUnique({
        where: { email: inviteDto.email },
      });

      let isNewUser = false;

      // Create user if doesn't exist
      if (!user) {
        // Generate a random temporary password
        const tempPassword = Math.random().toString(36).slice(-12);
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        user = await this.prisma.user.create({
          data: {
            email: inviteDto.email,
            password_hash: passwordHash,
            first_name: '',
            last_name: '',
          },
        });

        isNewUser = true;
        this.logger.log(`New user created for email ${inviteDto.email}`);
      }

      // Check if user is already a member
      const existingMembership =
        await this.prisma.organizationMembership.findFirst({
          where: {
            user_id: user.id,
            organization_id: organizationId,
          },
        });

      if (existingMembership) {
        this.logger.warn(
          `User ${user.id} is already a member of organization ${organizationId}`,
        );
        throw new ConflictException(
          'User is already a member of this organization',
        );
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

      // Create membership with invited status
      await this.prisma.organizationMembership.create({
        data: {
          user_id: user.id,
          organization_id: organizationId,
          role_id: memberRole.id,
          status: 'invited',
        },
      });

      this.logger.log(
        `User ${user.id} (${inviteDto.email}) invited to organization ${organizationId}`,
      );

      return {
        message: isNewUser
          ? 'New user created and invited to organization'
          : 'User invited to organization',
        userId: user.id,
        status: isNewUser ? 'new_user_created' : 'existing_user_invited',
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
        'Failed to invite user. Please try again later.',
      );
    }
  }
}
