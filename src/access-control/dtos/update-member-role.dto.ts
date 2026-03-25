import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';

export class UpdateMemberRoleDto {
  @ApiProperty({
    description: 'The new role ID to assign to this member',
    example: 'uuid-xxx',
  })
  @IsUUID('4', { message: i18nValidationMessage('errors.VALIDATION.IS_UUID') })
  role_id: string;
}
