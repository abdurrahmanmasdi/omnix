import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../auth/services/permissions.service';
import { CreateRoleDto } from './dtos/create-role.dto';
import { UpdateRoleDto } from './dtos/update-role.dto';
import { UpdateMemberRoleDto } from './dtos/update-member-role.dto';
import { CreatePermissionOverrideDto } from './dtos/create-permission-override.dto';
import { MembershipStatus, Prisma } from '@prisma/client';

export interface RoleWithPermissions {
  id: string;
  name: string;
  is_system: boolean;
  slug?: string | null;
  name_translations?: Record<string, string> | null;
  organization_id: string;
  created_at: Date;
  rolePermissions: Array<{
    permission: {
      id: string;
      action: string;
      description: string | null;
    };
  }>;
}

@Injectable()
export class AccessControlService {
  private readonly logger = new Logger(AccessControlService.name);

  constructor(
    private prisma: PrismaService,
    private i18n: I18nService,
    @Inject(forwardRef(() => PermissionsService))
    private permissionsService: PermissionsService,
  ) {}

  /**
   * Verify that the current user has ACTIVE membership in the organization
   * Throws ForbiddenException if verification fails
   */
  private async verifyUserInOrganization(
    organizationId: string,
    currentUserId: string,
  ): Promise<void> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organization_id: organizationId,
        user_id: currentUserId,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException(this.i18n.t('errors.UNAUTHORIZED_ACCESS'));
    }
  }

  /**
   * Verify that the current user is the Owner of the organization
   * Throws ForbiddenException if user is not Owner
   */
  private async verifyIsOwner(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organization_id: organizationId,
        user_id: userId,
        status: MembershipStatus.ACTIVE,
      },
      include: {
        role: {
          select: { slug: true },
        },
      },
    });

    const roleSlug =
      (membership as { role?: { slug?: string | null } } | null)?.role?.slug ??
      null;

    if (!membership || roleSlug !== 'owner') {
      throw new ForbiddenException(
        this.i18n.t('errors.ONLY_OWNER_CAN_PERFORM_THIS_ACTION'),
      );
    }
  }

  /**
   * Fetch all roles for an organization with their permissions
   * Includes RolePermission relation and actual Permission data
   */
  async getRoles(
    organizationId: string,
    currentUserId: string,
  ): Promise<RoleWithPermissions[]> {
    try {
      // Verify user has access to this organization
      await this.verifyUserInOrganization(organizationId, currentUserId);

      const roles = await this.prisma.role.findMany({
        where: {
          organization_id: organizationId,
        },
        include: {
          rolePermissions: {
            include: {
              permission: {
                select: {
                  id: true,
                  action: true,
                  description: true,
                },
              },
            },
          },
        },
        orderBy: {
          created_at: 'asc',
        },
      });

      this.logger.debug(
        `[AccessControlService] Retrieved ${roles.length} roles for organization ${organizationId}`,
      );

      return roles as RoleWithPermissions[];
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.error(
        `[AccessControlService] Error retrieving roles for organization ${organizationId}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Create a new role for the organization with associated permissions
   * Operation is wrapped in a transaction to ensure consistency
   */
  async createRole(
    organizationId: string,
    currentUserId: string,
    dto: CreateRoleDto,
  ): Promise<RoleWithPermissions> {
    try {
      // Verify user has access to this organization
      await this.verifyUserInOrganization(organizationId, currentUserId);

      // Validate that all provided permission IDs exist
      const permissions = await this.prisma.permission.findMany({
        where: {
          id: {
            in: dto.permissionIds,
          },
        },
        select: { id: true },
      });

      if (permissions.length !== dto.permissionIds.length) {
        throw new BadRequestException(
          this.i18n.t('errors.INVALID_PERMISSIONS'),
        );
      }

      // Create role and role permissions in a transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Step 1: Create the role
        const role = await tx.role.create({
          data: {
            name: dto.name,
            ...(dto.name_translations && {
              name_translations: dto.name_translations,
            }),
            organization_id: organizationId,
          },
        });

        // Step 2: Create role-permission associations (batch insert)
        await tx.rolePermission.createMany({
          data: dto.permissionIds.map((permissionId) => ({
            role_id: role.id,
            permission_id: permissionId,
          })),
          skipDuplicates: true,
        });

        // Step 3: Fetch the complete role with permissions
        const createdRole = await tx.role.findUnique({
          where: { id: role.id },
          include: {
            rolePermissions: {
              include: {
                permission: {
                  select: {
                    id: true,
                    action: true,
                    description: true,
                  },
                },
              },
            },
          },
        });

        return createdRole;
      });

      const typedResult = result as unknown as RoleWithPermissions;

      this.logger.debug(
        `[AccessControlService] Created role ${typedResult.id} with name "${dto.name}" for organization ${organizationId}`,
      );

      return typedResult;
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error(
        `[AccessControlService] Error creating role for organization ${organizationId}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Update a role's name and/or permissions
   * Operation is wrapped in a transaction
   * If permissions are modified, invalidates cache for all users holding this role
   */
  async updateRole(
    organizationId: string,
    roleId: string,
    currentUserId: string,
    dto: UpdateRoleDto,
  ): Promise<RoleWithPermissions> {
    try {
      // Verify caller is owner for role mutation operations.
      await this.verifyIsOwner(organizationId, currentUserId);

      // Verify the role belongs to this organization and is mutable.
      const existingRole = await this.prisma.role.findFirst({
        where: {
          id: roleId,
          organization_id: organizationId,
        },
        select: { id: true, is_system: true },
      });

      if (!existingRole) {
        throw new NotFoundException(this.i18n.t('errors.ROLE_NOT_FOUND'));
      }

      if (existingRole.is_system) {
        throw new ForbiddenException('System roles cannot be modified.');
      }

      const updateRoleDto = dto as {
        name?: string;
        name_translations?: Record<string, string>;
        permissionIds?: string[];
        permissionsToRemove?: string[];
        permissionsToAdd?: string[];
      };

      // Support both incremental updates (permissionsToAdd/permissionsToRemove)
      // and full replacement mode (permissionIds) for backward compatibility.
      let permissionsToRemove: string[] =
        updateRoleDto.permissionsToRemove ?? [];
      let permissionsToAdd: string[] = updateRoleDto.permissionsToAdd ?? [];

      if (updateRoleDto.permissionIds) {
        const requestedPermissionIds = [
          ...new Set(updateRoleDto.permissionIds),
        ];
        const permissions = await this.prisma.permission.findMany({
          where: {
            id: {
              in: requestedPermissionIds,
            },
          },
          select: { id: true },
        });

        if (permissions.length !== requestedPermissionIds.length) {
          throw new BadRequestException(
            this.i18n.t('errors.INVALID_PERMISSIONS'),
          );
        }

        const currentRolePermissions =
          await this.prisma.rolePermission.findMany({
            where: { role_id: roleId },
            select: { permission_id: true },
          });

        const currentPermissionSet = new Set(
          currentRolePermissions.map((p) => p.permission_id),
        );
        const requestedPermissionSet = new Set(requestedPermissionIds);

        permissionsToRemove = [...currentPermissionSet].filter(
          (permissionId) => !requestedPermissionSet.has(permissionId),
        );
        permissionsToAdd = [...requestedPermissionSet].filter(
          (permissionId) => !currentPermissionSet.has(permissionId),
        );
      } else {
        const permissionIdsToValidate = [
          ...new Set([...permissionsToAdd, ...permissionsToRemove]),
        ];

        if (permissionIdsToValidate.length > 0) {
          const permissions = await this.prisma.permission.findMany({
            where: {
              id: {
                in: permissionIdsToValidate,
              },
            },
            select: { id: true },
          });

          if (permissions.length !== permissionIdsToValidate.length) {
            throw new BadRequestException(
              this.i18n.t('errors.INVALID_PERMISSIONS'),
            );
          }
        }
      }

      // Optimized transaction: batch delete/add permissions, then update metadata.
      const result = await this.prisma.$transaction(async (tx) => {
        if (permissionsToRemove.length > 0) {
          await tx.rolePermission.deleteMany({
            where: {
              role_id: roleId,
              permission_id: { in: permissionsToRemove },
            },
          });
        }

        if (permissionsToAdd.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionsToAdd.map((permissionId) => ({
              role_id: roleId,
              permission_id: permissionId,
            })),
            skipDuplicates: true,
          });
        }

        const roleUpdateData: {
          name?: string;
          name_translations?: Prisma.InputJsonValue;
        } = {};

        if (updateRoleDto.name !== undefined) {
          roleUpdateData.name = updateRoleDto.name;
        }

        if (updateRoleDto.name_translations !== undefined) {
          roleUpdateData.name_translations =
            updateRoleDto.name_translations as Prisma.InputJsonValue;
        }

        const updatedRole = await tx.role.update({
          where: { id: roleId },
          data: roleUpdateData,
          include: {
            rolePermissions: {
              include: {
                permission: {
                  select: {
                    id: true,
                    action: true,
                    description: true,
                  },
                },
              },
            },
          },
        });

        return updatedRole;
      });

      const isPermissionsModified =
        permissionsToRemove.length > 0 || permissionsToAdd.length > 0;

      // If permissions were modified, invalidate cache for all users holding this role.
      if (isPermissionsModified) {
        const affectedMemberships =
          await this.prisma.organizationMembership.findMany({
            where: {
              organization_id: organizationId,
              role_id: roleId,
              status: MembershipStatus.ACTIVE,
            },
            select: {
              user_id: true,
            },
          });

        await Promise.all(
          affectedMemberships.map((membership) =>
            this.permissionsService.clearUserPermissionsCache(
              membership.user_id,
              organizationId,
            ),
          ),
        );

        if (affectedMemberships.length > 0) {
          this.logger.debug(
            `[AccessControlService] Invalidated permissions cache for ${affectedMemberships.length} users holding role ${roleId} in organization ${organizationId}`,
          );
        }
      }

      this.logger.debug(
        `[AccessControlService] Updated role ${roleId} for organization ${organizationId}`,
      );

      return result as RoleWithPermissions;
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error(
        `[AccessControlService] Error updating role ${roleId}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Delete a role from the organization
   * Validations:
   * - Role name must not be 'Owner' or 'Admin' (protected core roles)
   * - Role must not have any active OrganizationMembership records
   */
  async deleteRole(
    organizationId: string,
    roleId: string,
    currentUserId: string,
  ): Promise<{ message: string }> {
    try {
      // Verify user has access to this organization
      await this.verifyUserInOrganization(organizationId, currentUserId);

      // Verify the role belongs to this organization
      const role = await this.prisma.role.findFirst({
        where: {
          id: roleId,
          organization_id: organizationId,
        },
        select: { id: true, is_system: true },
      });

      if (!role) {
        throw new NotFoundException(this.i18n.t('errors.ROLE_NOT_FOUND'));
      }

      // System roles are immutable and cannot be deleted.
      if (role.is_system) {
        throw new ForbiddenException(
          'System roles cannot be deleted or modified.',
        );
      }

      // Validation: Check if there are active memberships using this role
      const activeMemberships = await this.prisma.organizationMembership.count({
        where: {
          role_id: roleId,
          status: MembershipStatus.ACTIVE,
        },
      });

      if (activeMemberships > 0) {
        throw new BadRequestException(
          this.i18n.t('errors.CANNOT_DELETE_ROLE_WITH_MEMBERS'),
        );
      }

      // Delete the role (cascading deletes RolePermission records automatically)
      await this.prisma.role.delete({
        where: { id: roleId },
      });

      this.logger.debug(
        `[AccessControlService] Deleted role ${roleId} from organization ${organizationId}`,
      );

      return {
        message: this.i18n.t('messages.ROLE_DELETED_SUCCESSFULLY'),
      };
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error(
        `[AccessControlService] Error deleting role ${roleId}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Assign a role to an organization member
   * Verifies caller is ACTIVE in the organization
   * Verifies the membership exists in the organization
   * Verifies the role exists in the organization
   */
  async assignRoleToMember(
    organizationId: string,
    membershipId: string,
    currentUserId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<{ id: string; role_id: string; message: string }> {
    try {
      // Verify caller has access to this organization
      await this.verifyUserInOrganization(organizationId, currentUserId);

      // Verify the membership exists and belongs to this organization
      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          id: membershipId,
          organization_id: organizationId,
        },
        select: { id: true },
      });

      if (!membership) {
        throw new NotFoundException(this.i18n.t('errors.MEMBERSHIP_NOT_FOUND'));
      }

      // Verify the role exists and belongs to this organization
      const role = await this.prisma.role.findFirst({
        where: {
          id: dto.role_id,
          organization_id: organizationId,
        },
        select: { id: true },
      });

      if (!role) {
        throw new NotFoundException(this.i18n.t('errors.ROLE_NOT_FOUND'));
      }

      // Update the membership with the new role
      await this.prisma.organizationMembership.update({
        where: { id: membershipId },
        data: { role_id: dto.role_id },
      });

      this.logger.debug(
        `[AccessControlService] Assigned role ${dto.role_id} to membership ${membershipId} in organization ${organizationId}`,
      );

      return {
        id: membershipId,
        role_id: dto.role_id,
        message: this.i18n.t('messages.ROLE_ASSIGNED_SUCCESSFULLY'),
      };
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      this.logger.error(
        `[AccessControlService] Error assigning role to membership ${membershipId}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Change a member's role within an organization
   * Security: Only Owner can perform this action
   * Restriction: Cannot change the role of a member who currently has Owner role
   */
  async changeMemberRole(
    organizationId: string,
    membershipId: string,
    newRoleId: string,
    currentUserId: string,
  ): Promise<{ id: string; role_id: string; message: string }> {
    try {
      // Verify caller is Owner
      await this.verifyIsOwner(organizationId, currentUserId);

      // Fetch the membership with role to check immutability
      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          id: membershipId,
          organization_id: organizationId,
        },
        select: {
          id: true,
          user_id: true,
          role: { select: { slug: true } },
        },
      });

      if (!membership) {
        throw new NotFoundException(this.i18n.t('errors.MEMBERSHIP_NOT_FOUND'));
      }

      const targetRoleSlug = (
        membership as {
          role?: { slug?: string | null };
        }
      ).role?.slug;

      // Check if target member has Owner role - cannot change Owner
      if (targetRoleSlug === 'owner') {
        throw new BadRequestException(
          this.i18n.t('errors.CANNOT_MODIFY_OWNER_ROLE'),
        );
      }

      // Verify new role exists and belongs to organization
      const newRole = await this.prisma.role.findFirst({
        where: {
          id: newRoleId,
          organization_id: organizationId,
        },
        select: { id: true },
      });

      if (!newRole) {
        throw new NotFoundException(this.i18n.t('errors.ROLE_NOT_FOUND'));
      }

      // Update membership role
      await this.prisma.organizationMembership.update({
        where: { id: membershipId },
        data: { role_id: newRoleId },
      });

      this.logger.debug(
        `[AccessControlService] Owner ${currentUserId} changed member ${membershipId} role to ${newRoleId} in organization ${organizationId}`,
      );

      // Invalidate cached permissions for the affected user
      await this.permissionsService.clearUserPermissionsCache(
        membership.user_id,
        organizationId,
      );

      return {
        id: membershipId,
        role_id: newRoleId,
        message: this.i18n.t('messages.MEMBER_ROLE_CHANGED_SUCCESSFULLY'),
      };
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error(
        `[AccessControlService] Error changing member role for membership ${membershipId}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Create or update a permission override for a membership
   * Allows granting or revoking specific permissions for a member regardless of role
   * Verifies caller is ACTIVE in the organization
   * Upserts a MembershipPermissionOverride record
   */
  async createPermissionOverride(
    organizationId: string,
    membershipId: string,
    currentUserId: string,
    dto: CreatePermissionOverrideDto,
  ): Promise<{
    id: string;
    permission_id: string;
    is_granted: boolean;
    message: string;
  }> {
    try {
      // Verify caller has access to this organization
      await this.verifyUserInOrganization(organizationId, currentUserId);

      // Verify the membership exists and belongs to this organization
      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          id: membershipId,
          organization_id: organizationId,
        },
        select: { id: true, user_id: true },
      });

      if (!membership) {
        throw new NotFoundException(this.i18n.t('errors.MEMBERSHIP_NOT_FOUND'));
      }

      // Verify the permission exists
      const permission = await this.prisma.permission.findFirst({
        where: { id: dto.permission_id },
        select: { id: true },
      });

      if (!permission) {
        throw new NotFoundException(this.i18n.t('errors.PERMISSION_NOT_FOUND'));
      }

      // Upsert the permission override
      const override = await this.prisma.membershipPermissionOverride.upsert({
        where: {
          membership_id_permission_id: {
            membership_id: membershipId,
            permission_id: dto.permission_id,
          },
        },
        update: {
          is_granted: dto.is_granted,
        },
        create: {
          membership_id: membershipId,
          permission_id: dto.permission_id,
          is_granted: dto.is_granted,
        },
        select: {
          id: true,
          permission_id: true,
          is_granted: true,
        },
      });

      this.logger.debug(
        `[AccessControlService] Created/updated permission override for membership ${membershipId}, permission ${dto.permission_id}, granted=${dto.is_granted}`,
      );

      // Invalidate cached permissions for the affected user
      await this.permissionsService.clearUserPermissionsCache(
        membership.user_id,
        organizationId,
      );

      return {
        id: override.id,
        permission_id: override.permission_id,
        is_granted: override.is_granted,
        message: this.i18n.t(
          'messages.PERMISSION_OVERRIDE_CREATED_SUCCESSFULLY',
        ),
      };
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      this.logger.error(
        `[AccessControlService] Error creating permission override for membership ${membershipId}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Assign a permission override for a membership
   * Security: Only Owner can perform this action
   * Restriction: Cannot assign permission overrides to a member who has Owner role
   */
  async assignPermissionOverride(
    organizationId: string,
    membershipId: string,
    permissionId: string,
    isGranted: boolean,
    currentUserId: string,
  ): Promise<{
    id: string;
    permission_id: string;
    is_granted: boolean;
    message: string;
  }> {
    try {
      // Verify caller is Owner
      await this.verifyIsOwner(organizationId, currentUserId);

      // Fetch the membership with role to check immutability
      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          id: membershipId,
          organization_id: organizationId,
        },
        select: {
          id: true,
          user_id: true,
          role: { select: { slug: true } },
        },
      });

      if (!membership) {
        throw new NotFoundException(this.i18n.t('errors.MEMBERSHIP_NOT_FOUND'));
      }

      const targetRoleSlug = (
        membership as {
          role?: { slug?: string | null };
        }
      ).role?.slug;

      // Check if target member has Owner role - cannot override Owner permissions
      if (targetRoleSlug === 'owner') {
        throw new BadRequestException(
          this.i18n.t('errors.CANNOT_OVERRIDE_OWNER_PERMISSIONS'),
        );
      }

      // Verify permission exists
      const permission = await this.prisma.permission.findFirst({
        where: { id: permissionId },
        select: { id: true },
      });

      if (!permission) {
        throw new NotFoundException(this.i18n.t('errors.PERMISSION_NOT_FOUND'));
      }

      // Upsert the permission override
      const override = await this.prisma.membershipPermissionOverride.upsert({
        where: {
          membership_id_permission_id: {
            membership_id: membershipId,
            permission_id: permissionId,
          },
        },
        update: {
          is_granted: isGranted,
        },
        create: {
          membership_id: membershipId,
          permission_id: permissionId,
          is_granted: isGranted,
        },
        select: {
          id: true,
          permission_id: true,
          is_granted: true,
        },
      });

      this.logger.debug(
        `[AccessControlService] Owner ${currentUserId} assigned permission override for membership ${membershipId}, permission ${permissionId}, granted=${isGranted}`,
      );

      // Invalidate cached permissions for the affected user
      await this.permissionsService.clearUserPermissionsCache(
        membership.user_id,
        organizationId,
      );

      return {
        id: override.id,
        permission_id: override.permission_id,
        is_granted: override.is_granted,
        message: this.i18n.t(
          'messages.PERMISSION_OVERRIDE_ASSIGNED_SUCCESSFULLY',
        ),
      };
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error(
        `[AccessControlService] Error assigning permission override for membership ${membershipId}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Fetch all global system permissions
   * Sorted alphabetically by action for UI presentation
   * No authentication beyond JWT is required
   */
  async getAllPermissions(): Promise<
    { id: string; action: string; description: string | null }[]
  > {
    try {
      const permissions = await this.prisma.permission.findMany({
        select: {
          id: true,
          action: true,
          description: true,
        },
        orderBy: {
          action: 'asc',
        },
      });

      this.logger.debug(
        `[AccessControlService] Retrieved ${permissions.length} global permissions`,
      );

      return permissions;
    } catch (error) {
      this.logger.error(
        `[AccessControlService] Error retrieving global permissions: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Get a detailed breakdown of a member's permissions
   * Shows which permissions come from their assigned role vs explicit overrides
   * Security: Only Owner can view permission breakdowns
   * Returns: { rolePermissionIds: string[], grantedOverrideIds: string[] }
   */
  async getMemberPermissionBreakdown(
    organizationId: string,
    membershipId: string,
    currentUserId: string,
  ): Promise<{ rolePermissionIds: string[]; grantedOverrideIds: string[] }> {
    try {
      // Verify caller is Owner
      await this.verifyIsOwner(organizationId, currentUserId);

      // Fetch the membership with role and role permissions
      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          id: membershipId,
          organization_id: organizationId,
        },
        include: {
          role: {
            include: {
              rolePermissions: {
                select: {
                  permission_id: true,
                },
              },
            },
          },
        },
      });

      if (!membership) {
        throw new NotFoundException(this.i18n.t('errors.MEMBERSHIP_NOT_FOUND'));
      }

      // Fetch permission overrides where is_granted === true
      const overrides = await this.prisma.membershipPermissionOverride.findMany(
        {
          where: {
            membership_id: membershipId,
            is_granted: true,
          },
          select: {
            permission_id: true,
          },
        },
      );

      // Extract permission IDs from role
      const rolePermissionIds = membership.role.rolePermissions.map(
        (rp) => rp.permission_id,
      );

      // Extract permission IDs from granted overrides
      const grantedOverrideIds = overrides.map((o) => o.permission_id);

      this.logger.debug(
        `[AccessControlService] Retrieved permission breakdown for membership ${membershipId}: ${rolePermissionIds.length} from role, ${grantedOverrideIds.length} overrides`,
      );

      return {
        rolePermissionIds,
        grantedOverrideIds,
      };
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      this.logger.error(
        `[AccessControlService] Error retrieving permission breakdown for membership ${membershipId}: ${error}`,
      );
      throw error;
    }
  }
}
