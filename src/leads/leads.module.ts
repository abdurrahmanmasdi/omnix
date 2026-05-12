import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { QueryBuilderService } from '../common/query/query-builder.service';

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, QueryBuilderService],
  exports: [LeadsService],
})
export class LeadsModule {}
