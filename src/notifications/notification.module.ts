import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { QueryBuilderService } from '../common/query/query-builder.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, QueryBuilderService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
