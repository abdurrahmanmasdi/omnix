import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { MembershipsService } from './memberships.service';
import { InvitationsService } from './invitations.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { OrganizationProvisioningService } from './services/organization-provisioning.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, AuthModule, AccessControlModule, RedisModule],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsService,
    MembershipsService,
    InvitationsService,
    OrganizationProvisioningService,
  ],
  exports: [MembershipsService, InvitationsService],
})
export class OrganizationsModule {}
