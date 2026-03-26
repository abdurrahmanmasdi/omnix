import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessControlService } from './access-control.service';
import { AccessControlController } from './access-control.controller';
import { MembershipAccessControlController } from './membership-access-control.controller';
import { PermissionsController } from './permissions.controller';

@Module({
  imports: [PrismaModule],
  providers: [AccessControlService],
  controllers: [
    AccessControlController,
    MembershipAccessControlController,
    PermissionsController,
  ],
  exports: [AccessControlService],
})
export class AccessControlModule {}
