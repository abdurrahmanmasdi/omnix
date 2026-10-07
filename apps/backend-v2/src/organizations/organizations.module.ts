import { ClinicFactsController } from './clinic-facts.controller';
import { ClinicFactsService } from './clinic-facts.service';
import { ClinicTeamController } from './clinic-team.controller';
import { ClinicTeamService } from './clinic-team.service';
import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [
    OrganizationsController,
    ClinicTeamController,
    ClinicFactsController,
  ],
  providers: [OrganizationsService, ClinicTeamService, ClinicFactsService],
})
export class OrganizationsModule {}
