import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MembershipStatus, Prisma } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { AccessVerificationService } from './access-verification.service';
import { CreateRoleDto } from './dtos/create-role.dto';
import { UpdateRoleDto } from './dtos/update-role.dto';

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
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    private prisma: PrismaService,
    private i18n: I18nService,
    private eventEmitter: EventEmitter2,
    private accessVerificationService: AccessVerificationService,
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

  async getRoles(
    organizationId: string,
    currentUserId: string,
  ): Promise<RoleWithPermissions[]> {
    try {
      await this.accessVerificationService.verifyUserInOrganization(
        organizationId,
        currentUserId,
      );

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

  async createRole(
    organizationId: string,
    currentUserId: string,
    dto: CreateRoleDto,
  ): Promise<RoleWithPermissions> {
    try {
      await this.accessVerificationService.verifyUserInOrganization(
        organizationId,
        currentUserId,
      );

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

      const result = await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: {
            name: dto.name,
            ...(dto.name_translations && {
              name_translations: dto.name_translations,
            }),
            organization_id: organizationId,
          },
        });

        await tx.rolePermission.createMany({
          data: dto.permissionIds.map((permissionId) => ({
            role_id: role.id,
            permission_id: permissionId,
          })),
          skipDuplicates: true,
        });

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

  async updateRole(
    organizationId: string,
    roleId: string,
    currentUserId: string,
    dto: UpdateRoleDto,
  ): Promise<RoleWithPermissions> {
    try {
      await this.accessVerificationService.verifyIsOwner(
        organizationId,
        currentUserId,
      );

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
            this.emitPermissionCacheClearEvent(
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

  async deleteRole(
    organizationId: string,
    roleId: string,
    currentUserId: string,
  ): Promise<{ message: string }> {
    try {
      await this.accessVerificationService.verifyUserInOrganization(
        organizationId,
        currentUserId,
      );

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

      if (role.is_system) {
        throw new ForbiddenException(
          'System roles cannot be deleted or modified.',
        );
      }

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
}
