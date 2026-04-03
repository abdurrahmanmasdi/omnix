import { Module } from '@nestjs/common';
import { ProposalsService } from './proposals.service';
import { ProposalsController } from './proposals.controller';
import { ProductsModule } from '../products/products.module';
import { AccessControlModule } from '../access-control/access-control.module';

@Module({
  imports: [ProductsModule, AccessControlModule],
  providers: [ProposalsService],
  controllers: [ProposalsController],
})
export class ProposalsModule {}
