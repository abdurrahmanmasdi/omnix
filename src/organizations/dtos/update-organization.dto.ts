import {
  IsString,
  IsOptional,
  IsBoolean,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';

export class UpdateOrganizationDto {
  @ApiProperty({
    example: 'Acme Corporation',
    description: 'The name of the organization',
    required: false,
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING') })
  @MinLength(3, {
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.MIN_LENGTH'),
  })
  @MaxLength(255, {
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.MAX_LENGTH'),
  })
  name?: string;

  @ApiProperty({
    example: 'acme-corporation',
    description: 'The URL-friendly slug of the organization',
    required: false,
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING') })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.SLUG_FORMAT'),
  })
  @MinLength(3, {
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.MIN_LENGTH'),
  })
  @MaxLength(255, {
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.MAX_LENGTH'),
  })
  slug?: string;

  @ApiProperty({
    example: true,
    description: 'Whether the organization is publicly visible',
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_BOOLEAN') })
  is_public?: boolean;
}
