import { IsUUID, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreatePermissionOverrideDto {
  @ApiProperty({
    description: 'The permission ID to override',
    example: 'uuid-xxx',
  })
  @IsUUID('4', { message: i18nValidationMessage('errors.VALIDATION.IS_UUID') })
  permission_id: string;

  @ApiProperty({
    description: 'Whether to grant (true) or revoke (false) this permission',
    example: true,
  })
  @IsBoolean({ message: i18nValidationMessage('errors.VALIDATION.IS_BOOLEAN') })
  is_granted: boolean;
}
