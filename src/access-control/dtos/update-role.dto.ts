import {
  IsString,
  IsArray,
  IsUUID,
  IsOptional,
  MinLength,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';

export class UpdateRoleDto {
  @ApiProperty({
    example: 'Senior Manager',
    description: 'The updated name of the role',
    minLength: 3,
    maxLength: 255,
    required: false,
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('errors.VALIDATION.IS_STRING') })
  @MinLength(3, {
    message: i18nValidationMessage('errors.VALIDATION.MIN_LENGTH'),
  })
  @MaxLength(255, {
    message: i18nValidationMessage('errors.VALIDATION.MAX_LENGTH'),
  })
  name?: string;

  @ApiProperty({
    example: [
      '550e8400-e29b-41d4-a716-446655440000',
      '550e8400-e29b-41d4-a716-446655440001',
    ],
    description: 'Updated array of permission IDs to assign to the role',
    type: [String],
    minItems: 1,
    required: false,
  })
  @IsOptional()
  @IsArray({ message: i18nValidationMessage('errors.VALIDATION.IS_ARRAY') })
  @ArrayMinSize(1, {
    message: i18nValidationMessage('errors.VALIDATION.MIN_ARRAY_SIZE'),
  })
  @ArrayMaxSize(100, {
    message: i18nValidationMessage('errors.VALIDATION.MAX_ARRAY_SIZE'),
  })
  @IsUUID('4', {
    each: true,
    message: i18nValidationMessage('errors.VALIDATION.INVALID_UUID'),
  })
  permissionIds?: string[];
}
