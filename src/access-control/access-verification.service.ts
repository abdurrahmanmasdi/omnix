import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MembershipStatus } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RequestContextService } from '../request-context/request-context.service';
import { UpdateMemberRoleDto } from './dtos/update-member-role.dto';

@Injectable()
export class AccessVerificationService {
  private readonly logger = new Logger(AccessVerificationService.name);
  private readonly privilegedRoleSlugs = new Set(['owner', 'admin', 'manager']);
  private readonly membershipCacheTtlSeconds = 900;

  constructor(
    private prisma: PrismaService,
    private i18n: I18nService,
    private eventEmitter: EventEmitter2,
    private redis: RedisService,
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

  async verifyUserInOrganization(
    organizationId: string,
    currentUserId: string,
  ): Promise<void> {
    const cacheKey = `org_membership:${organizationId}:${currentUserId}`;

    const cachedMembershipStatus = await this.redis.get(cacheKey);
    if (cachedMembershipStatus === MembershipStatus.ACTIVE) {
      return;
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organization_id: organizationId,
        user_id: currentUserId,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException(
        this.i18n.t('auth.ERRORS.UNAUTHORIZED_ACCESS'),
      );
    }

    await this.redis.set(
      cacheKey,
      MembershipStatus.ACTIVE,
      this.membershipCacheTtlSeconds,
    );
  }

  async verifyIsOwner(organizationId: string, userId: string): Promise<void> {
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
        this.i18n.t('organizations.ERRORS.ONLY_OWNER_CAN_PERFORM_THIS_ACTION'),
      );
    }
  }

  async verifyIsOwnerOrAdmin(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    // Use bypass to query the tenant-bound model without relying on interceptor context
    const membership = await this.requestContextService.runWithBypass(
      async () =>
        this.prisma.organizationMembership.findFirst({
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
        }),
    );

    const roleSlug =
      (membership as { role?: { slug?: string | null } } | null)?.role?.slug ??
      null;

    if (!membership || !roleSlug || !this.privilegedRoleSlugs.has(roleSlug)) {
      throw new ForbiddenException(
        this.i18n.t('auth.ERRORS.INSUFFICIENT_PERMISSIONS'),
      );
    }
  }

  async assignRoleToMember(
    organizationId: string,
    membershipId: string,
    currentUserId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<{ id: string; role_id: string; message: string }> {
    try {
      await this.verifyIsOwnerOrAdmin(organizationId, currentUserId);

      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          id: membershipId,
          organization_id: organizationId,
        },
        select: { id: true },
      });

      if (!membership) {
        throw new NotFoundException(
          this.i18n.t('organizations.ERRORS.MEMBERSHIP_NOT_FOUND'),
        );
      }

      const role = await this.prisma.role.findFirst({
        where: {
          id: dto.role_id,
          organization_id: organizationId,
        },
        select: { id: true },
      });

      if (!role) {
        throw new NotFoundException(
          this.i18n.t('organizations.ERRORS.ROLE_NOT_FOUND'),
        );
      }

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
        message: this.i18n.t(
          'organizations.MESSAGES.ROLE_ASSIGNED_SUCCESSFULLY',
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
        `[AccessControlService] Error assigning role to membership ${membershipId}: ${error}`,
      );
      throw error;
    }
  }

  async changeMemberRole(
    organizationId: string,
    membershipId: string,
    newRoleId: string,
    currentUserId: string,
  ): Promise<{ id: string; role_id: string; message: string }> {
    try {
      await this.verifyIsOwner(organizationId, currentUserId);

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
        throw new NotFoundException(
          this.i18n.t('organizations.ERRORS.MEMBERSHIP_NOT_FOUND'),
        );
      }

      const targetRoleSlug = (
        membership as {
          role?: { slug?: string | null };
        }
      ).role?.slug;

      if (targetRoleSlug === 'owner') {
        throw new BadRequestException(
          this.i18n.t('organizations.ERRORS.CANNOT_MODIFY_OWNER_ROLE'),
        );
      }

      const newRole = await this.prisma.role.findFirst({
        where: {
          id: newRoleId,
          organization_id: organizationId,
        },
        select: { id: true },
      });

      if (!newRole) {
        throw new NotFoundException(
          this.i18n.t('organizations.ERRORS.ROLE_NOT_FOUND'),
        );
      }

      await this.prisma.organizationMembership.update({
        where: { id: membershipId },
        data: { role_id: newRoleId },
      });

      this.logger.debug(
        `[AccessControlService] Owner ${currentUserId} changed member ${membershipId} role to ${newRoleId} in organization ${organizationId}`,
      );

      await this.emitPermissionCacheClearEvent(
        membership.user_id,
        organizationId,
      );

      return {
        id: membershipId,
        role_id: newRoleId,
        message: this.i18n.t(
          'organizations.MESSAGES.MEMBER_ROLE_CHANGED_SUCCESSFULLY',
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
        `[AccessControlService] Error changing member role for membership ${membershipId}: ${error}`,
      );
      throw error;
    }
  }
}
