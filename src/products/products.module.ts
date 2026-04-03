import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductMediaService } from './product-media/product-media.service';
import { AvailabilityService } from './availability/availability.service';
import { ProductsController } from './products.controller';
import { ProductsQueryBuilder } from './utils/products.query-builder';

@Module({
  providers: [
    ProductsService,
    ProductMediaService,
    AvailabilityService,
    ProductsQueryBuilder,
  ],
  controllers: [ProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}
