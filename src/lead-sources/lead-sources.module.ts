import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LeadSourcesController } from './lead-sources.controller';
import { LeadSourcesService } from './lead-sources.service';

@Module({
  imports: [PrismaModule, AuthModule, AccessControlModule],
  controllers: [LeadSourcesController],
  providers: [LeadSourcesService],
})
export class LeadSourcesModule {}
