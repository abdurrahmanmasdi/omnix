import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

/**
 * DTO for updating products
 * Extends CreateProductDto but makes all fields optional
 */
export class UpdateProductDto extends PartialType(CreateProductDto) {}
