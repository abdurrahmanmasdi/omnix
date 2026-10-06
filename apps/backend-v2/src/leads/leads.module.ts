import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { QueryBuilderService } from '../common/query/query-builder.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [LeadsController],
  providers: [LeadsService, QueryBuilderService],
  exports: [LeadsService],
})
export class LeadsModule {}
