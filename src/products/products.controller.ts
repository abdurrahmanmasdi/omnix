import { Controller, Get, Post, Body, Patch, Param, Delete, Put, Req, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { ProductsService, CreateProductDto, UpdateProductDto } from './products.service';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { ProductMediaService } from './product-media/product-media.service';

interface TenantRequest extends Request {
  tenantId: string;
}

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productMediaService: ProductMediaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a product' })
  create(@Req() req: TenantRequest, @Body() createProductDto: CreateProductDto) {
    return this.productsService.create(req.tenantId, createProductDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all products' })
  findAll(@Req() req: TenantRequest, @Query() query: FindProductsQueryDto) {
    return this.productsService.findAll(req.tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by id' })
  findOne(@Req() req: TenantRequest, @Param('id') id: string) {
    return this.productsService.findOne(req.tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product' })
  update(@Req() req: TenantRequest, @Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(req.tenantId, id, updateProductDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a product' })
  remove(@Req() req: TenantRequest, @Param('id') id: string) {
    return this.productsService.remove(req.tenantId, id);
  }

  @Post(':id/media')
  @ApiOperation({ summary: 'Add media to a product' })
  addMedia(
    @Param('id') id: string, 
    @Body() body: { file_url: string; file_name?: string }
  ) {
    return this.productMediaService.createMedia(id, body.file_url, body.file_name);
  }

  @Put(':id/media/:mediaId/primary')
  @ApiOperation({ summary: 'Set primary media for a product' })
  setPrimaryMedia(
    @Param('id') id: string,
    @Param('mediaId') mediaId: string
  ) {
    return this.productMediaService.setPrimaryMedia(id, mediaId);
  }
}
