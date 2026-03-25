import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../auth/services/permissions.service';
import {
  CreateRoleDto,
  AttachPermissionsToRoleDto,
  UpdateMemberRoleDto,
  CreatePermissionOverrideDto,
} from './dtos';

@Injectable()
export class AccessControlService {
  private readonly logger = new Logger(AccessControlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * Create a new custom role for the tenant
   */
  async createRole(tenantId: string, dto: CreateRoleDto) {
    this.logger.debug(
      `[AccessControlService] Creating role "${dto.name}" for tenant ${tenantId}`,
    );

    // Check if role with same name already exists in this tenant
    const existingRole = await this.prisma.role.findFirst({
      where: {
        name: dto.name,
        organization_id: tenantId,
      },
    });

    if (existingRole) {
      throw new BadRequestException(
        this.i18n.t('errors.ACCESS.ROLE_EXISTS', {
          args: { roleName: dto.name },
        }),
      );
    }

    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        organization_id: tenantId,
      },
    });

    this.logger.log(
      `[AccessControlService] Role "${role.name}" created for tenant ${tenantId}`,
    );

    return {
      id: role.id,
      name: role.name,
      organization_id: role.organization_id,
      created_at: role.created_at,
    };
  }

  /**
   * Attach permissions to a role
   * Validates that role belongs to the tenant
   */
  async attachPermissionsToRole(
    tenantId: string,
    roleId: string,
    dto: AttachPermissionsToRoleDto,
  ) {
    this.logger.debug(
      `[AccessControlService] Attaching ${dto.permission_ids.length} permissions to role ${roleId} for tenant ${tenantId}`,
    );

    // Step 1: Verify role exists and belongs to this tenant
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!role) {
      throw new NotFoundException(this.i18n.t('errors.ORG.ROLE_NOT_FOUND'));
    }

    if (role.organization_id && role.organization_id !== tenantId) {
      this.logger.warn(
        `[AccessControlService] Unauthorized access attempt: User from tenant ${tenantId} tried to access role ${roleId} from tenant ${role.organization_id}`,
      );
      throw new ForbiddenException(this.i18n.t('errors.ACCESS.ROLE_FORBIDDEN'));
    }

    // Step 2: Verify all permissions exist
    const permissions = await this.prisma.permission.findMany({
      where: {
        id: {
          in: dto.permission_ids,
        },
      },
    });

    if (permissions.length !== dto.permission_ids.length) {
      throw new BadRequestException(
        this.i18n.t('errors.ACCESS.PERMISSIONS_NOT_FOUND'),
      );
    }

    // Step 3: Get existing role-permission associations
    const existingRolePermissions = await this.prisma.rolePermission.findMany({
      where: {
        role_id: roleId,
      },
    });

    const existingPermissionIds = existingRolePermissions.map(
      (rp) => rp.permission_id,
    );

    // Step 4: Create missing associations
    const newPermissionIds = dto.permission_ids.filter(
      (id) => !existingPermissionIds.includes(id),
    );

    if (newPermissionIds.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: newPermissionIds.map((permission_id) => ({
          role_id: roleId,
          permission_id,
        })),
      });
    }

    // Step 5: Invalidate cache for all members with this role in this tenant
    // This ensures they get fresh permissions on next request
    await this.invalidateCacheForRoleMembers(tenantId, roleId);

    this.logger.log(
      `[AccessControlService] Successfully attached ${newPermissionIds.length} new permissions to role ${roleId}`,
    );

    return {
      message: `Attached ${newPermissionIds.length} new permissions to role`,
      role_id: roleId,
      permissions_attached: newPermissionIds.length,
    };
  }

  /**
   * Update a member's role
   * Validates membership belongs to tenant
   */
  async updateMemberRole(
    tenantId: string,
    membershipId: string,
    dto: UpdateMemberRoleDto,
  ) {
    this.logger.debug(
      `[AccessControlService] Updating role for membership ${membershipId} in tenant ${tenantId}`,
    );

    // Step 1: Verify membership exists and belongs to this tenant
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { id: membershipId },
    });

    if (!membership) {
      throw new NotFoundException(
        this.i18n.t('errors.ACCESS.MEMBERSHIP_NOT_FOUND'),
      );
    }

    if (membership.organization_id !== tenantId) {
      this.logger.warn(
        `[AccessControlService] Unauthorized access attempt: User from tenant ${tenantId} tried to access membership ${membershipId} from tenant ${membership.organization_id}`,
      );
      throw new ForbiddenException(
        this.i18n.t('errors.ACCESS.MEMBERSHIP_FORBIDDEN'),
      );
    }

    // Step 2: Verify new role exists and belongs to this tenant
    const newRole = await this.prisma.role.findUnique({
      where: { id: dto.role_id },
    });

    if (!newRole) {
      throw new NotFoundException(this.i18n.t('errors.ORG.ROLE_NOT_FOUND'));
    }

    if (newRole.organization_id && newRole.organization_id !== tenantId) {
      throw new ForbiddenException(this.i18n.t('errors.ACCESS.ROLE_FORBIDDEN'));
    }

    // Step 3: Update the membership
    const updatedMembership = await this.prisma.organizationMembership.update({
      where: { id: membershipId },
      data: {
        role_id: dto.role_id,
      },
      include: {
        user: { select: { email: true } },
        role: { select: { name: true } },
      },
    });

    // Step 4: Invalidate permission cache for this user
    await this.permissionsService.invalidateUserPermissionsCache(
      membership.user_id,
      tenantId,
    );

    this.logger.log(
      `[AccessControlService] Member ${membership.user_id} role updated to "${updatedMembership.role?.name}" in tenant ${tenantId}`,
    );

    return {
      message: `Role updated to "${updatedMembership.role?.name}"`,
      membership_id: membershipId,
      user_email: updatedMembership.user?.email,
      new_role: updatedMembership.role?.name,
    };
  }

  /**
   * Create or update a permission override for a member
   * Allows fine-grained control over individual permissions
   */
  async createOrUpdatePermissionOverride(
    tenantId: string,
    membershipId: string,
    dto: CreatePermissionOverrideDto,
  ) {
    this.logger.debug(
      `[AccessControlService] Creating/updating permission override for membership ${membershipId} in tenant ${tenantId}`,
    );

    // Step 1: Verify membership exists and belongs to this tenant
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { id: membershipId },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!membership) {
      throw new NotFoundException(`Membership ${membershipId} not found`);
    }

    if (membership.organization_id !== tenantId) {
      this.logger.warn(
        `[AccessControlService] Unauthorized access attempt: User from tenant ${tenantId} tried to access membership ${membershipId} from tenant ${membership.organization_id}`,
      );
      throw new ForbiddenException(
        this.i18n.t('errors.ACCESS.MEMBERSHIP_FORBIDDEN'),
      );
    }

    // Step 2: Verify permission exists
    const permission = await this.prisma.permission.findUnique({
      where: { id: dto.permission_id },
    });

    if (!permission) {
      throw new NotFoundException(`Permission ${dto.permission_id} not found`);
    }

    // Step 3: Check if override already exists
    const existingOverride =
      await this.prisma.membershipPermissionOverride.findUnique({
        where: {
          membership_id_permission_id: {
            membership_id: membershipId,
            permission_id: dto.permission_id,
          },
        },
      });

    // Step 4: Create or update override
    if (existingOverride) {
      await this.prisma.membershipPermissionOverride.update({
        where: {
          membership_id_permission_id: {
            membership_id: membershipId,
            permission_id: dto.permission_id,
          },
        },
        data: {
          is_granted: dto.is_granted,
        },
      });
    } else {
      await this.prisma.membershipPermissionOverride.create({
        data: {
          membership_id: membershipId,
          permission_id: dto.permission_id,
          is_granted: dto.is_granted,
        },
      });
    }

    // Step 5: Invalidate permission cache for this user
    // Forces fresh permission calculation on next request
    await this.permissionsService.invalidateUserPermissionsCache(
      membership.user_id,
      tenantId,
    );

    this.logger.log(
      `[AccessControlService] Permission override for user ${membership.user?.email}: permission "${permission.name}" set to ${dto.is_granted ? 'GRANTED' : 'REVOKED'}`,
    );

    return {
      message: `Permission override created/updated`,
      membership_id: membershipId,
      permission_name: permission.name,
      is_granted: dto.is_granted,
      cache_invalidated: true,
    };
  }

  /**
   * Internal: Invalidate cache for all members with a specific role
   * Called when role permissions change
   */
  private async invalidateCacheForRoleMembers(
    tenantId: string,
    roleId: string,
  ) {
    try {
      // Find all members with this role in this tenant
      const memberships = await this.prisma.organizationMembership.findMany({
        where: {
          role_id: roleId,
          organization_id: tenantId,
        },
        select: { user_id: true },
      });

      // Invalidate cache for each member
      const invalidationPromises = memberships.map((membership) =>
        this.permissionsService.invalidateUserPermissionsCache(
          membership.user_id,
          tenantId,
        ),
      );

      await Promise.all(invalidationPromises);

      this.logger.debug(
        `[AccessControlService] Invalidated cache for ${memberships.length} members with role ${roleId}`,
      );
    } catch (error) {
      this.logger.error(
        `[AccessControlService] Error invalidating cache for role members: ${error}`,
      );
      // Don't throw - cache invalidation is a nice-to-have but shouldn't block the operation
    }
  }

  /**
   * Get all system permissions
   * Useful for frontend to render permission checkboxes
   */
  async getSystemPermissions() {
    this.logger.debug('[AccessControlService] Fetching all system permissions');

    const permissions = await this.prisma.permission.findMany({
      orderBy: {
        name: 'asc',
      },
    });

    return permissions;
  }

  /**
   * Get all roles available to the tenant
   * Returns both global roles (organization_id: NULL) and tenant-specific roles
   */
  async getRoles(tenantId: string) {
    this.logger.debug(
      `[AccessControlService] Fetching roles for tenant ${tenantId}`,
    );

    const roles = await this.prisma.role.findMany({
      where: {
        OR: [
          { organization_id: null }, // Global system roles
          { organization_id: tenantId }, // Tenant-specific roles
        ],
      },
      orderBy: {
        name: 'asc',
      },
    });

    return roles;
  }

  /**
   * Get a specific role with all its attached permissions
   * Validates role belongs to the tenant (or is global)
   */
  async getRole(tenantId: string, roleId: string) {
    this.logger.debug(
      `[AccessControlService] Fetching role ${roleId} for tenant ${tenantId}`,
    );

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        rolePermissions: {
          include: {
            permission: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(this.i18n.t('errors.ORG.ROLE_NOT_FOUND'));
    }

    // Validate tenant access (allow access to global roles or tenant's own roles)
    if (role.organization_id && role.organization_id !== tenantId) {
      this.logger.warn(
        `[AccessControlService] Unauthorized access attempt: User from tenant ${tenantId} tried to access role ${roleId} from tenant ${role.organization_id}`,
      );
      throw new ForbiddenException(this.i18n.t('errors.ACCESS.ROLE_FORBIDDEN'));
    }

    return {
      id: role.id,
      name: role.name,
      organization_id: role.organization_id,
      created_at: role.created_at,
      permissions: role.rolePermissions.map((rp) => rp.permission),
    };
  }

  /**
   * Get all members (active memberships) for the current tenant
   * Includes user profile and role information
   */
  async getMembers(tenantId: string) {
    this.logger.debug(
      `[AccessControlService] Fetching members for tenant ${tenantId}`,
    );

    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        organization_id: tenantId,
        status: 'active', // Only active members
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
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
        created_at: 'desc',
      },
    });

    return memberships.map((membership) => ({
      id: membership.id,
      user_id: membership.user_id,
      organization_id: membership.organization_id,
      role_id: membership.role_id,
      status: membership.status,
      created_at: membership.created_at,
      user: membership.user,
      role: membership.role,
    }));
  }

  /**
   * Get a specific member with their role and permission overrides
   * Validates membership belongs to the tenant
   */
  async getMember(tenantId: string, membershipId: string) {
    this.logger.debug(
      `[AccessControlService] Fetching member ${membershipId} for tenant ${tenantId}`,
    );

    const membership = await this.prisma.organizationMembership.findUnique({
      where: { id: membershipId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            created_at: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
          },
          include: {
            rolePermissions: {
              include: {
                permission: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                  },
                },
              },
            },
          },
        },
        permissionOverrides: {
          include: {
            permission: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException(
        this.i18n.t('errors.ACCESS.MEMBERSHIP_NOT_FOUND'),
      );
    }

    // Validate tenant access
    if (membership.organization_id !== tenantId) {
      this.logger.warn(
        `[AccessControlService] Unauthorized access attempt: User from tenant ${tenantId} tried to access membership ${membershipId} from tenant ${membership.organization_id}`,
      );
      throw new ForbiddenException(
        this.i18n.t('errors.ACCESS.MEMBERSHIP_FORBIDDEN'),
      );
    }

    return {
      id: membership.id,
      user_id: membership.user_id,
      organization_id: membership.organization_id,
      role_id: membership.role_id,
      status: membership.status,
      created_at: membership.created_at,
      user: membership.user,
      role: membership.role
        ? {
            ...membership.role,
            permissions: membership.role.rolePermissions.map(
              (rp) => rp.permission,
            ),
          }
        : null,
      permissionOverrides: membership.permissionOverrides.map((override) => ({
        id: override.id,
        permission_id: override.permission_id,
        is_granted: override.is_granted,
        permission: override.permission,
      })),
    };
  }
}
