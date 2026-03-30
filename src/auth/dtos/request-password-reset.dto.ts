import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class RequestPasswordResetDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail(
    {},
    { message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_EMAIL') },
  )
  email: string;
}
