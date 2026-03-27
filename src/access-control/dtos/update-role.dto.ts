import {
  IsString,
  IsArray,
  IsUUID,
  IsObject,
  IsOptional,
  MinLength,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';

export class UpdateRoleDto {
  @ApiProperty({
    example: 'Sistem Yöneticisi',
    description: 'The updated Turkish name of the role',
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
    example: { en: 'System Admin', ar: 'مسؤول النظام' },
    description: 'Updated translations of the role name',
  })
  @IsOptional()
  @IsObject({ message: i18nValidationMessage('errors.VALIDATION.IS_OBJECT') })
  name_translations?: Record<string, string>;

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
  @IsUUID('4', {
    each: true,
    message: i18nValidationMessage('errors.VALIDATION.INVALID_UUID'),
  })
  permissionIds?: string[];

  @ApiProperty({
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    description: 'Permission IDs to remove from the role incrementally',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray({ message: i18nValidationMessage('errors.VALIDATION.IS_ARRAY') })
  @IsUUID('4', {
    each: true,
    message: i18nValidationMessage('errors.VALIDATION.INVALID_UUID'),
  })
  permissionsToRemove?: string[];

  @ApiProperty({
    example: ['550e8400-e29b-41d4-a716-446655440001'],
    description: 'Permission IDs to add to the role incrementally',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray({ message: i18nValidationMessage('errors.VALIDATION.IS_ARRAY') })
  @IsUUID('4', {
    each: true,
    message: i18nValidationMessage('errors.VALIDATION.INVALID_UUID'),
  })
  permissionsToAdd?: string[];
}
