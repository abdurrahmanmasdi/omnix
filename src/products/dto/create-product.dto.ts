import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsUrl,
  IsObject,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductType } from '@prisma/client';

/**
 * Validated DTO for product media attachments
 */
export class ProductMediaDto {
  @ApiProperty({
    example: 'https://cdn.example.com/products/item-1.jpg',
  })
  @IsUrl()
  file_url!: string;

  @ApiPropertyOptional({ example: 'cover-image.jpg' })
  @IsString()
  @IsOptional()
  file_name?: string;
}

/**
 * Validated DTO for product addons
 */
export class ProductAddonDto {
  @ApiProperty({ example: 'VIP Pickup' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 25 })
  @IsNumber()
  price!: number;
}

/**
 * Validated DTO for product instances (scheduled events, rentals, etc.)
 */
export class ProductInstanceDto {
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-05-01T10:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  start_date?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-05-01T12:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  end_date?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsNumber()
  @IsOptional()
  max_capacity?: number;
}

/**
 * Validated DTO for creating products with strict type checking
 * Replaces the unvalidated interface approach with runtime validation
 */
export class CreateProductDto {
  @ApiProperty({ enum: ProductType, example: ProductType.RESOURCE_RENTAL })
  @IsEnum(ProductType)
  type!: ProductType;

  @ApiProperty({ example: 'Premium SUV Rental' })
  @IsString()
  title!: string;

  @ApiPropertyOptional({
    example: 'Automatic SUV with full insurance included.',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 120 })
  @IsNumber()
  base_price!: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsString()
  @IsOptional()
  currency?: string;

  /**
   * Generic JSON object for product specifications
   * Examples: dimensions, materials, colors, etc.
   */
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { transmission: 'AUTOMATIC', seats: 5 },
  })
  @IsObject()
  @IsOptional()
  specifications?: Record<string, any>;

  /**
   * Array of addon options available for this product
   * Examples: delivery options, warranties, extended services
   */
  @ApiPropertyOptional({ type: () => [ProductAddonDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAddonDto)
  @IsOptional()
  available_addons?: Record<string, any>[];

  @ApiPropertyOptional({ type: () => [ProductMediaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMediaDto)
  @IsOptional()
  media?: ProductMediaDto[];

  @ApiPropertyOptional({ type: () => [ProductInstanceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductInstanceDto)
  @IsOptional()
  instances?: ProductInstanceDto[];
}
