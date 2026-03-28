import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { AccessVerificationService } from './access-verification.service';
import { CreatePermissionOverrideDto } from './dtos/create-permission-override.dto';

@Injectable()
export class PermissionOverridesService {
  private readonly logger = new Logger(PermissionOverridesService.name);

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
      await this.accessVerificationService.verifyUserInOrganization(
        organizationId,
        currentUserId,
      );

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

      const permission = await this.prisma.permission.findFirst({
        where: { id: dto.permission_id },
        select: { id: true },
      });

      if (!permission) {
        throw new NotFoundException(this.i18n.t('errors.PERMISSION_NOT_FOUND'));
      }

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

      await this.emitPermissionCacheClearEvent(
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
      await this.accessVerificationService.verifyIsOwner(
        organizationId,
        currentUserId,
      );

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

      if (targetRoleSlug === 'owner') {
        throw new BadRequestException(
          this.i18n.t('errors.CANNOT_OVERRIDE_OWNER_PERMISSIONS'),
        );
      }

      const permission = await this.prisma.permission.findFirst({
        where: { id: permissionId },
        select: { id: true },
      });

      if (!permission) {
        throw new NotFoundException(this.i18n.t('errors.PERMISSION_NOT_FOUND'));
      }

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

      await this.emitPermissionCacheClearEvent(
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

  async removePermissionOverride(
    organizationId: string,
    membershipId: string,
    permissionId: string,
    currentUserId: string,
  ): Promise<{ message: string }> {
    try {
      await this.accessVerificationService.verifyIsOwner(
        organizationId,
        currentUserId,
      );

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

      if (targetRoleSlug === 'owner') {
        throw new BadRequestException(
          this.i18n.t('errors.CANNOT_OVERRIDE_OWNER_PERMISSIONS'),
        );
      }

      const permission = await this.prisma.permission.findFirst({
        where: { id: permissionId },
        select: { id: true },
      });

      if (!permission) {
        throw new NotFoundException(this.i18n.t('errors.PERMISSION_NOT_FOUND'));
      }

      await this.prisma.membershipPermissionOverride.deleteMany({
        where: {
          membership_id: membershipId,
          permission_id: permissionId,
        },
      });

      await this.emitPermissionCacheClearEvent(
        membership.user_id,
        organizationId,
      );

      return {
        message: this.i18n.t(
          'messages.PERMISSION_OVERRIDE_CREATED_SUCCESSFULLY',
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
        `[AccessControlService] Error removing permission override for membership ${membershipId}: ${error}`,
      );
      throw error;
    }
  }

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

  async getMemberPermissionBreakdown(
    organizationId: string,
    membershipId: string,
    currentUserId: string,
  ): Promise<{ rolePermissionIds: string[]; grantedOverrideIds: string[] }> {
    try {
      await this.accessVerificationService.verifyIsOwner(
        organizationId,
        currentUserId,
      );

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

      const rolePermissionIds = membership.role.rolePermissions.map(
        (rp) => rp.permission_id,
      );

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
