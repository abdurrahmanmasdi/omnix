import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class ApproveMembershipRequestDto {
  @ApiProperty({
    example: 'a6c29f00-3f8f-4d8b-b0ee-6f2ef2e20c11',
    description: 'Role ID to assign to approved membership',
  })
  @IsUUID('4', {
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_UUID'),
  })
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_NOT_EMPTY'),
  })
  roleId: string;
}
