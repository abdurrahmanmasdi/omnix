import {
  IsString,
  IsOptional,
  IsBoolean,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({
    example: 'Acme Corporation',
    description: 'The name of the organization',
  })
  @IsString({ message: 'Name must be a string' })
  @MinLength(3, { message: 'Name must be at least 3 characters long' })
  @MaxLength(255, { message: 'Name must not exceed 255 characters' })
  name: string;

  @ApiProperty({
    example: 'acme-corporation',
    description: 'The URL-friendly slug of the organization',
  })
  @IsString({ message: 'Slug must be a string' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens',
  })
  @MinLength(3, { message: 'Slug must be at least 3 characters long' })
  @MaxLength(255, { message: 'Slug must not exceed 255 characters' })
  slug: string;

  @ApiProperty({
    example: true,
    description: 'Whether the organization is publicly visible',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'is_public must be a boolean' })
  is_public?: boolean;
}
