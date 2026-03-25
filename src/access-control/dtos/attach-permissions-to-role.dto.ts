import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';

export class AttachPermissionsToRoleDto {
  @ApiProperty({
    description: 'Array of permission IDs to attach to the role',
    example: ['uuid-1', 'uuid-2'],
    isArray: true,
  })
  @IsArray({ message: i18nValidationMessage('errors.VALIDATION.IS_ARRAY') })
  @IsUUID('4', {
    each: true,
    message: i18nValidationMessage('errors.VALIDATION.IS_UUID'),
  })
  permission_ids: string[];
}
