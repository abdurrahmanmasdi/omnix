import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsUrl,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductType } from '@prisma/client';

/**
 * Validated DTO for product media attachments
 */
export class ProductMediaDto {
  @IsUrl()
  file_url!: string;

  @IsString()
  @IsOptional()
  file_name?: string;
}

/**
 * Validated DTO for product instances (scheduled events, rentals, etc.)
 */
export class ProductInstanceDto {
  @IsOptional()
  start_date?: Date;

  @IsOptional()
  end_date?: Date;

  @IsNumber()
  @IsOptional()
  max_capacity?: number;
}

/**
 * Validated DTO for creating products with strict type checking
 * Replaces the unvalidated interface approach with runtime validation
 */
export class CreateProductDto {
  @IsEnum(ProductType)
  type!: ProductType;

  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  base_price!: number;

  @IsString()
  @IsOptional()
  currency?: string;

  /**
   * Generic JSON object for product specifications
   * Examples: dimensions, materials, colors, etc.
   */
  @IsObject()
  @IsOptional()
  specifications?: Record<string, any>;

  /**
   * Array of addon options available for this product
   * Examples: delivery options, warranties, extended services
   */
  @IsArray()
  @IsOptional()
  available_addons?: Record<string, any>[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMediaDto)
  @IsOptional()
  media?: ProductMediaDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductInstanceDto)
  @IsOptional()
  instances?: ProductInstanceDto[];
}
