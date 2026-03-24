import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Get user's calculated permissions for a specific organization
   * First tries Redis cache, falls back to database if Redis fails or misses
   *
   * @param userId User ID
   * @param tenantId Organization ID
   * @returns Array of permission strings
   *
   * @throws Error only if database query fails (Redis failures are gracefully handled)
   */
  async getUserPermissions(
    userId: string,
    tenantId: string,
  ): Promise<string[]> {
    const cacheKey = `tenant:${tenantId}:user:${userId}:permissions`;

    // Step 1: Try to get from Redis
    try {
      const cachedPermissions = await this.redis.get(cacheKey);
      if (cachedPermissions) {
        this.logger.debug(
          `[PermissionsService] Cache hit for user ${userId} in tenant ${tenantId}`,
        );
        return JSON.parse(cachedPermissions) as string[];
      }
    } catch (error) {
      this.logger.warn(
        `[PermissionsService] Redis read failed for user ${userId} in tenant ${tenantId}. Falling back to database. Error: ${error}`,
      );
      // Continue to database fallback
    }

    // Step 2: Query database for permissions
    this.logger.debug(
      `[PermissionsService] Cache miss for user ${userId}. Querying database...`,
    );

    const permissions = await this.calculatePermissionsFromDatabase(
      userId,
      tenantId,
    );

    // Step 3: Save to Redis with 15-minute TTL (900 seconds)
    try {
      await this.redis.set(cacheKey, JSON.stringify(permissions), 900);
      this.logger.debug(
        `[PermissionsService] Cached permissions for user ${userId} in tenant ${tenantId}`,
      );
    } catch (error) {
      this.logger.warn(
        `[PermissionsService] Failed to cache permissions in Redis for user ${userId}. Error: ${error}`,
      );
      // Non-critical: permission system still works without cache
    }

    return permissions;
  }

  /**
   * Internal: Calculate permissions from database
   * Combines role permissions with membership-level overrides
   *
   * @private
   */
  private async calculatePermissionsFromDatabase(
    userId: string,
    tenantId: string,
  ): Promise<string[]> {
    // Get user's membership and role in this organization
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        user_id: userId,
        organization_id: tenantId,
      },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!membership) {
      this.logger.warn(
        `[PermissionsService] User ${userId} has no membership in organization ${tenantId}`,
      );
      return [];
    }

    // Get base permissions from role
    const basePermissions = new Map<string, boolean>();

    if (membership.role?.rolePermissions) {
      for (const rp of membership.role.rolePermissions) {
        basePermissions.set(rp.permission.name, true);
      }
    }

    // Apply membership-level permission overrides (can grant or revoke)
    const overrides = await this.prisma.membershipPermissionOverride.findMany({
      where: {
        membership_id: membership.id,
      },
      include: {
        permission: true,
      },
    });

    for (const override of overrides) {
      // true = grant, false = revoke
      basePermissions.set(override.permission.name, override.is_granted);
    }

    // Filter to only permissions that are granted (true)
    const finalPermissions = Array.from(basePermissions.entries())
      .filter(([, granted]) => granted)
      .map(([permission]) => permission);

    return finalPermissions;
  }

  /**
   * Invalidate cached permissions for a user (call when role/permissions change)
   */
  async invalidateUserPermissionsCache(
    userId: string,
    tenantId: string,
  ): Promise<void> {
    const cacheKey = `tenant:${tenantId}:user:${userId}:permissions`;
    try {
      await this.redis.del(cacheKey);
      this.logger.debug(
        `[PermissionsService] Invalidated cache for user ${userId} in tenant ${tenantId}`,
      );
    } catch (error) {
      this.logger.warn(
        `[PermissionsService] Failed to invalidate cache for user ${userId}. Error: ${error}`,
      );
    }
  }
}
