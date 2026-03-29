import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadsQueryBuilder } from './utils/leads.query-builder';

@Module({
  imports: [PrismaModule, AccessControlModule, AuthModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadsQueryBuilder],
  exports: [LeadsService],
})
export class LeadsModule {}
