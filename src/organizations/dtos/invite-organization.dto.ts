import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';

export class InviteToOrganizationDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'The email address of the user to invite',
  })
  @IsEmail({}, { message: i18nValidationMessage('errors.VALIDATION.IS_EMAIL') })
  email: string;
}
