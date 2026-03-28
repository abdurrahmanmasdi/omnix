import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { MembershipStatus } from '@prisma/client';

interface ClearUserPermissionsCacheEvent {
  userId: string;
  organizationId: string;
}

/**
 * PermissionsService handles permission-based access control (PBAC) with Redis caching.
 * Calculates effective permissions for users considering:
 * - Their role's base permissions
 * - Individual permission overrides
 *
 * All permission data is cached in Redis with a 1-hour TTL for performance.
 */
@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  // 1 hour in seconds
  private readonly PERMISSIONS_CACHE_TTL = 3600;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Get effective permissions for a user in an organization
   *
   * Calculation process:
   * 1. Check Redis cache first (fast path)
   * 2. If not cached, query database:
   *    - Find active membership with role
   *    - Get all role permissions
   *    - Apply membership permission overrides
   * 3. Cache result in Redis with 1-hour TTL
   * 4. Return array of permission action strings
   *
   * @param userId - The user ID
   * @param orgId - The organization ID
   * @returns Array of permission action strings (e.g., ['READ', 'WRITE', 'DELETE'])
   */
  async getEffectivePermissions(
    userId: string,
    orgId: string,
  ): Promise<string[]> {
    const cacheKey = `org:${orgId}:user:${userId}:permissions`;

    // Step 1: Cache Check
    try {
      const cachedPermissions = await this.redis.get(cacheKey);
      if (cachedPermissions) {
        this.logger.debug(
          `[PermissionsService] Cache HIT for permissions: ${cacheKey}`,
        );
        return JSON.parse(cachedPermissions) as string[];
      }
    } catch (error) {
      this.logger.warn(
        `[PermissionsService] Error parsing cached permissions for ${cacheKey}: ${error}`,
      );
      // Continue to database fallback
    }

    this.logger.debug(
      `[PermissionsService] Cache MISS for permissions: ${cacheKey}, querying database`,
    );

    // Step 2: Database Fallback
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        user_id: userId,
        organization_id: orgId,
        status: MembershipStatus.ACTIVE,
      },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: {
                  select: {
                    action: true,
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
                action: true,
              },
            },
          },
        },
      },
    });

    // If membership not found or not ACTIVE, return empty permissions
    if (!membership) {
      this.logger.debug(
        `[PermissionsService] No active membership found for user ${userId} in org ${orgId}`,
      );
      // Cache empty permissions to avoid repeated database queries
      await this.redis.set(
        cacheKey,
        JSON.stringify([]),
        this.PERMISSIONS_CACHE_TTL,
      );
      return [];
    }

    // Step 3: Permission Calculation Logic
    // Start with base permissions from the role
    const permissionSet = new Set<string>();

    // Add all role permissions
    for (const rolePermission of membership.role.rolePermissions) {
      permissionSet.add(rolePermission.permission.action);
    }

    // Apply permission overrides
    for (const override of membership.permissionOverrides) {
      const action = override.permission.action;
      if (override.is_granted) {
        // Grant the permission
        permissionSet.add(action);
      } else {
        // Revoke the permission
        permissionSet.delete(action);
      }
    }

    // Convert set to sorted array for consistent caching
    const effectivePermissions = Array.from(permissionSet).sort();

    this.logger.debug(
      `[PermissionsService] Calculated effective permissions for user ${userId} in org ${orgId}: [${effectivePermissions.join(', ')}]`,
    );

    // Step 4: Cache Storage
    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(effectivePermissions),
        this.PERMISSIONS_CACHE_TTL,
      );
      this.logger.debug(
        `[PermissionsService] Cached permissions for ${cacheKey} (TTL: ${this.PERMISSIONS_CACHE_TTL}s)`,
      );
    } catch (error) {
      this.logger.warn(
        `[PermissionsService] Error caching permissions for ${cacheKey}: ${error}`,
      );
      // Silently fail - Redis unavailability is handled by RedisService
    }

    return effectivePermissions;
  }

  /**
   * Clear user permissions from cache
   *
   * Call this method whenever:
   * - User's role changes
   * - Permission overrides are added/updated/removed
   * - User is removed from organization
   *
   * @param userId - The user ID
   * @param orgId - The organization ID
   */
  async clearUserPermissionsCache(
    userId: string,
    orgId: string,
  ): Promise<void> {
    const cacheKey = `org:${orgId}:user:${userId}:permissions`;

    try {
      const deletedCount = await this.redis.del(cacheKey);
      if (deletedCount > 0) {
        this.logger.debug(
          `[PermissionsService] Cleared permissions cache for ${cacheKey}`,
        );
      } else {
        this.logger.debug(
          `[PermissionsService] Cache key ${cacheKey} did not exist`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `[PermissionsService] Error clearing permissions cache for ${cacheKey}: ${error}`,
      );
      // Silently fail - Redis unavailability is handled by RedisService
    }
  }

  @OnEvent('permissions.cache.clear-user')
  async handleClearUserPermissionsCacheEvent(
    payload: ClearUserPermissionsCacheEvent,
  ): Promise<void> {
    await this.clearUserPermissionsCache(
      payload.userId,
      payload.organizationId,
    );
  }

  /**
   * Clear all permissions from cache for an organization
   *
   * Use this sparingly - only when organization-wide permission changes occur
   * Consider clearing individual user cache when possible
   *
   * @param orgId - The organization ID
   */
  clearOrganizationPermissionsCache(orgId: string): void {
    try {
      // Note: This uses SCAN pattern matching which is efficient
      // Alternative: If Redis client doesn't support SCAN, implement user-by-user clearing
      this.logger.debug(
        `[PermissionsService] Attempting to clear all permissions cache for org ${orgId}`,
      );
      // TODO: Implement SCAN-based pattern deletion if needed
    } catch (error) {
      this.logger.warn(
        `[PermissionsService] Error clearing org permissions cache for ${orgId}: ${error}`,
      );
    }
  }

  /**
   * Check if user has a specific permission in an organization
   *
   * @param userId - The user ID
   * @param orgId - The organization ID
   * @param permission - The permission action to check (e.g., 'READ', 'WRITE')
   * @returns true if user has the permission, false otherwise
   */
  async hasPermission(
    userId: string,
    orgId: string,
    permission: string,
  ): Promise<boolean> {
    const permissions = await this.getEffectivePermissions(userId, orgId);
    return permissions.includes(permission);
  }

  /**
   * Check if user has all specified permissions in an organization
   *
   * @param userId - The user ID
   * @param orgId - The organization ID
   * @param permissions - Array of permission actions to check
   * @returns true if user has all permissions, false otherwise
   */
  async hasAllPermissions(
    userId: string,
    orgId: string,
    permissions: string[],
  ): Promise<boolean> {
    const userPermissions = await this.getEffectivePermissions(userId, orgId);
    return permissions.every((perm) => userPermissions.includes(perm));
  }

  /**
   * Check if user has any of the specified permissions in an organization
   *
   * @param userId - The user ID
   * @param orgId - The organization ID
   * @param permissions - Array of permission actions to check
   * @returns true if user has at least one permission, false otherwise
   */
  async hasAnyPermission(
    userId: string,
    orgId: string,
    permissions: string[],
  ): Promise<boolean> {
    const userPermissions = await this.getEffectivePermissions(userId, orgId);
    return permissions.some((perm) => userPermissions.includes(perm));
  }
}
