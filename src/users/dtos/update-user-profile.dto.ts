import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  IsArray,
  ArrayNotEmpty,
  MaxLength,
} from 'class-validator';

/**
 * DTO for updating global user profile information.
 * These fields apply to the user across all organizations/workspaces.
 */
export class UpdateUserProfileDto {
  @ApiPropertyOptional({
    description: 'URL to user avatar image',
    example: 'https://example.com/avatar.jpg',
    type: String,
  })
  @IsOptional()
  @IsUrl(
    { require_protocol: true, require_host: true },
    {
      message: 'avatar_url must be a valid URL',
    },
  )
  avatar_url?: string;

  @ApiPropertyOptional({
    description: 'Phone number of the user',
    example: '+1234567890',
    type: String,
  })
  @IsOptional()
  @IsString({
    message: 'phone_number must be a string',
  })
  @MaxLength(20, {
    message: 'phone_number must not exceed 20 characters',
  })
  phone_number?: string;

  @ApiPropertyOptional({
    description: 'WhatsApp number of the user',
    example: '+1234567890',
    type: String,
  })
  @IsOptional()
  @IsString({
    message: 'whatsapp_number must be a string',
  })
  @MaxLength(20, {
    message: 'whatsapp_number must not exceed 20 characters',
  })
  whatsapp_number?: string;

  @ApiPropertyOptional({
    description: 'List of languages spoken by the user',
    example: ['English', 'Spanish', 'French'],
    type: [String],
    isArray: true,
  })
  @IsOptional()
  @IsArray({
    message: 'spoken_languages must be an array of strings',
  })
  @ArrayNotEmpty({
    message: 'spoken_languages array cannot be empty',
  })
  @IsString({
    each: true,
    message: 'each language must be a string',
  })
  @MaxLength(50, {
    each: true,
    message: 'each language must not exceed 50 characters',
  })
  spoken_languages?: string[];
}
