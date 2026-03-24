import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSIONS_LIST } from '../constants/permissions.list';

@Injectable()
export class PermissionSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionSeederService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    this.logger.debug(
      '[PermissionSeederService] Starting permission seeding on application bootstrap...',
    );

    const newPermissions: string[] = [];

    for (const permissionDefinition of PERMISSIONS_LIST) {
      try {
        const permission = await this.prisma.permission.upsert({
          where: { name: permissionDefinition.name },
          update: {}, // Do nothing if permission already exists
          create: {
            name: permissionDefinition.name,
            description: permissionDefinition.description,
          },
        });

        // Track newly created permissions
        if (permission) {
          // Check if this was a new creation by verifying via count
          const existingCount = await this.prisma.permission.count({
            where: { name: permissionDefinition.name },
          });

          // If upsert just created it, it will be the only record
          if (existingCount === 1) {
            newPermissions.push(permissionDefinition.name);
          }
        }
      } catch (error) {
        this.logger.error(
          `[PermissionSeederService] Error seeding permission "${permissionDefinition.name}": ${error}`,
        );
        // Continue with next permission even if one fails
      }
    }

    if (newPermissions.length > 0) {
      this.logger.log(
        `[PermissionSeederService] Seeded ${newPermissions.length} new permissions: [${newPermissions.join(', ')}]`,
      );
    } else {
      this.logger.debug(
        '[PermissionSeederService] All permissions already exist in database. No new permissions added.',
      );
    }
  }
}
