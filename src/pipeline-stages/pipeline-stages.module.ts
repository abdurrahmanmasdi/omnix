import { Module } from '@nestjs/common';
import { PipelineStagesService } from './pipeline-stages.service';
import { PipelineStagesController } from './pipeline-stages.controller';

@Module({
  controllers: [PipelineStagesController],
  providers: [PipelineStagesService],
  exports: [PipelineStagesService], // Exported in case LeadsService needs it
})
export class PipelineStagesModule {}
