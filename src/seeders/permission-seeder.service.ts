import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSIONS_LIST } from '../constants/permissions.registry';

/**
 * PermissionSeederService
 *
 * Automatically syncs system permissions to the database on application startup.
 *
 * Strategy: For each permission in SYSTEM_PERMISSIONS, we perform an upsert:
 * - If permission with that action exists: Update description (if changed)
 * - If permission doesn't exist: Create it
 *
 * This ensures:
 * 1. New permissions are automatically added when the server starts
 * 2. Permission descriptions can be updated without manual DB intervention
 * 3. No permission duplicates
 * 4. Clean separation between code (permissions.list.ts) and database
 *
 * When to add new permissions:
 * 1. Add to the appropriate array in src/constants/permissions.list.ts
 * 2. Restart the server
 * 3. ✅ Done - permission is now in the database and ready to assign to roles
 */
@Injectable()
export class PermissionSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionSeederService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Called when the application starts
   * Syncs all system permissions to the database
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      this.logger.log('🌱 Starting permission seeding...');
      const startTime = Date.now();

      let createdCount = 0;
      let updatedCount = 0;

      // Upsert each permission
      for (const permission of PERMISSIONS_LIST) {
        const result = await this.prisma.permission.upsert({
          where: {
            action: permission.action,
          },
          update: {
            description: permission.description,
          },
          create: {
            action: permission.action,
            description: permission.description,
          },
        });

        // Track if it was created or updated
        // Note: Prisma's upsert doesn't tell us if it created or updated,
        // so we'll use a separate check if needed for logging
        // For now, we just count successful operations
      }

      // Get more detailed stats
      const stats = await this.getSeederStats();

      const duration = Date.now() - startTime;

      this.logger.log(
        `✅ Permission seeding completed in ${duration}ms | Total permissions: ${stats.total}, Status: ${stats.statusMsg}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Permission seeding failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Get statistics about seeded permissions
   */
  private async getSeederStats(): Promise<{
    total: number;
    statusMsg: string;
  }> {
    const total = await this.prisma.permission.count();
    const expectedCount = PERMISSIONS_LIST.length;

    const statusMsg =
      total === expectedCount
        ? `All ${total} permissions synced ✓`
        : `${total} permissions (expected ${expectedCount})`;

    return { total, statusMsg };
  }
}
