import { Module } from '@nestjs/common';
import { ProposalsService } from './proposals.service';
import { ProposalsController } from './proposals.controller';

@Module({
  providers: [ProposalsService],
  controllers: [ProposalsController]
})
export class ProposalsModule {}
