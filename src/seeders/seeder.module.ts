import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionSeederService } from './permission-seeder.service';

/**
 * SeederModule
 *
 * Provides all database seeding services.
 * These services automatically run when the application starts.
 *
 * Currently includes:
 * - PermissionSeederService: Auto-syncs system permissions to the database
 */
@Module({
  imports: [PrismaModule],
  providers: [PermissionSeederService],
  exports: [PermissionSeederService],
})
export class SeederModule {}
