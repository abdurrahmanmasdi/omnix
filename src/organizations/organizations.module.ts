import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { MembershipsService } from './memberships.service';
import { InvitationsService } from './invitations.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AccessControlModule } from '../access-control/access-control.module';

@Module({
  imports: [PrismaModule, AuthModule, AccessControlModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, MembershipsService, InvitationsService],
  exports: [MembershipsService, InvitationsService],
})
export class OrganizationsModule {}
