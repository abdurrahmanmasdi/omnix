import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueryBuilderService } from '../common/query/query-builder.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [LeadsController],
  providers: [LeadsService, QueryBuilderService],
  exports: [LeadsService],
})
export class LeadsModule {}
