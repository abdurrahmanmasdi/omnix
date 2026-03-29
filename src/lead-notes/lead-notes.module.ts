import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuthModule } from '../auth/auth.module';
import { LeadNotesController } from './lead-notes.controller';
import { LeadNotesService } from './lead-notes.service';

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [LeadNotesController],
  providers: [LeadNotesService],
  exports: [LeadNotesService],
})
export class LeadNotesModule {}
