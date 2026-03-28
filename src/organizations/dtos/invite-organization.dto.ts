import { IsEmail, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';

export class InviteToOrganizationDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'The email address of the user to invite',
  })
  @IsEmail({}, { message: i18nValidationMessage('errors.VALIDATION.IS_EMAIL') })
  email: string;

  @ApiProperty({
    example: 'a6c29f00-3f8f-4d8b-b0ee-6f2ef2e20c11',
    description: 'The role ID to assign when the invite is accepted',
  })
  @IsUUID('4', {
    message: i18nValidationMessage('errors.VALIDATION.IS_UUID'),
  })
  roleId: string;
}
