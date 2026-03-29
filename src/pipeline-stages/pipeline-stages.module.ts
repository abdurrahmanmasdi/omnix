import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PipelineStagesController } from './pipeline-stages.controller';
import { PipelineStagesService } from './pipeline-stages.service';

@Module({
  imports: [PrismaModule, AuthModule, AccessControlModule],
  controllers: [PipelineStagesController],
  providers: [PipelineStagesService],
})
export class PipelineStagesModule {}
