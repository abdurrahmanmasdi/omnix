import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { AccessVerificationService } from '../access-control/access-verification.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AppPermission } from '../constants/permissions.registry';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { ProductMediaService } from './product-media/product-media.service';
import {
  CreateProductDto,
  ProductsService,
  UpdateProductDto,
} from './products.service';

interface AuthRequest extends ExpressRequest {
  user: {
    id: string;
  };
}

@ApiTags('products')
@ApiBearerAuth()
@Controller('organizations/:organizationId/products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productMediaService: ProductMediaService,
    private readonly accessVerificationService: AccessVerificationService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PRODUCTS_CREATE)
  @ApiOperation({ summary: 'Create a product in an organization' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  async create(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Request() req: AuthRequest,
    @Body() createProductDto: CreateProductDto,
  ) {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );
    return this.productsService.create(organizationId, createProductDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PRODUCTS_READ)
  @ApiOperation({ summary: 'List products in organization with pagination' })
  @ApiResponse({ status: 200, description: 'Products fetched successfully' })
  async findAll(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Request() req: AuthRequest,
    @Query() query: FindProductsQueryDto,
  ) {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );
    return this.productsService.findAll(organizationId, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PRODUCTS_READ)
  @ApiOperation({ summary: 'Get a single product from an organization' })
  @ApiResponse({ status: 200, description: 'Product fetched successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findOne(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: AuthRequest,
  ) {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );
    return this.productsService.findOne(organizationId, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Update a product in an organization' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async update(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: AuthRequest,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );
    return this.productsService.update(organizationId, id, updateProductDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PRODUCTS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product from an organization' })
  @ApiResponse({ status: 204, description: 'Product deleted successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async remove(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: AuthRequest,
  ): Promise<void> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );
    await this.productsService.remove(organizationId, id);
  }

  @Post(':id/media')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PRODUCTS_EDIT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add media to a product' })
  @ApiResponse({ status: 201, description: 'Media added successfully' })
  async addMedia(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: AuthRequest,
    @Body() body: { file_url: string; file_name?: string },
  ): Promise<any> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );
    return await this.productMediaService.createMedia(
      id,
      body.file_url,
      body.file_name,
    );
  }

  @Put(':id/media/:mediaId/primary')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Set primary media for a product' })
  @ApiResponse({ status: 200, description: 'Primary media set successfully' })
  async setPrimaryMedia(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
    @Request() req: AuthRequest,
  ): Promise<void> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );
    await this.productMediaService.setPrimaryMedia(id, mediaId);
  }
}
