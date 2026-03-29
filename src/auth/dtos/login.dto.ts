import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_EMAIL') })
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString({ message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING') })
  password: string;
}
