import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuthModule } from '../auth/auth.module';
import { LeadAttachmentsController } from './lead-attachments.controller';
import { LeadAttachmentsService } from './lead-attachments.service';

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [LeadAttachmentsController],
  providers: [LeadAttachmentsService],
  exports: [LeadAttachmentsService],
})
export class LeadAttachmentsModule {}
