import { Module } from '@nestjs/common';
import { LeadSourcesService } from './lead-sources.service';
import { LeadSourcesController } from './lead-sources.controller';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [LeadSourcesController],
  providers: [LeadSourcesService],
  exports: [LeadSourcesService],
})
export class LeadSourcesModule {}
