import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AccessControlController } from './access-control.controller';
import { MembershipAccessControlController } from './membership-access-control.controller';
import { PermissionsController } from './permissions.controller';
import { RolesService } from './roles.service';
import { PermissionOverridesService } from './permission-overrides.service';
import { AccessVerificationService } from './access-verification.service';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [PrismaModule, AuthModule, RedisModule],
  providers: [
    RolesService,
    PermissionOverridesService,
    AccessVerificationService,
  ],
  controllers: [
    AccessControlController,
    MembershipAccessControlController,
    PermissionsController,
  ],
  exports: [
    RolesService,
    PermissionOverridesService,
    AccessVerificationService,
  ],
})
export class AccessControlModule {}
