import {
  BadRequestException,
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
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uuid } from 'uuid';
import * as fs from 'fs';
import { Request as ExpressRequest } from 'express';
import { AccessVerificationService } from '../access-control/access-verification.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AppPermission } from '../constants/permissions.registry';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductMediaService } from './product-media/product-media.service';
import { ProductsService } from './products.service';

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

  @Patch(':id/media/:mediaId/primary')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PRODUCTS_EDIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set primary media for a product' })
  @ApiResponse({ status: 200, description: 'Primary media set successfully' })
  @ApiResponse({
    status: 400,
    description: 'Media not found or does not belong to product',
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async setPrimaryMedia(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
    @Request() req: AuthRequest,
  ): Promise<any> {
    // Verify user belongs to the organization
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    // Set primary media and return the updated record
    const updatedMedia = await this.productMediaService.setPrimaryMedia(
      id,
      mediaId,
    );

    return {
      message: 'Primary media set successfully',
      data: updatedMedia,
    };
  }

  @Post(':id/media/upload')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PRODUCTS_EDIT)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = './uploads/products';

          // Check if directory exists, if not, create it recursively
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }

          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const ext = file.originalname.split('.').pop();
          const filename = `${uuid()}.${ext}`;
          cb(null, filename);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedMimes.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              `Invalid file type: ${file.mimetype}. Only JPEG, PNG, and WebP are allowed.`,
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload media files for a product' })
  @ApiResponse({
    status: 201,
    description: 'Files uploaded and media records created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async uploadMedia(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('id', new ParseUUIDPipe()) productId: string,
    @Request() req: AuthRequest,
    @UploadedFiles() files?: Array<{ filename: string; originalname: string }>,
  ): Promise<any> {
    // Verify user belongs to the organization
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    // Verify product exists and belongs to the organization
    const product = await this.productsService.findOne(
      organizationId,
      productId,
    );
    if (!product) {
      throw new BadRequestException(
        'Product not found or does not belong to this organization',
      );
    }

    if (!files || files.length === 0) {
      throw new BadRequestException('No files were uploaded');
    }

    const uploadedMedia: any[] = [];

    // Process each uploaded file
    for (const file of files) {
      const fileUrl = `/uploads/products/${file.filename}`;
      const media = await this.productMediaService.createMedia(
        productId,
        fileUrl,
        file.originalname,
      );
      uploadedMedia.push(media);
    }

    return {
      message: `Successfully uploaded ${uploadedMedia.length} file(s)`,
      data: uploadedMedia,
    };
  }
}
