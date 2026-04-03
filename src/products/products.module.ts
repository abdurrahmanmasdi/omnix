import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductMediaService } from './product-media/product-media.service';
import { AvailabilityService } from './availability/availability.service';
import { ProductsController } from './products.controller';

@Module({
  providers: [
    ProductsService,
    ProductMediaService,
    AvailabilityService,
  ],
  controllers: [ProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}
