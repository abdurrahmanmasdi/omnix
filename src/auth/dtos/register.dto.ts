import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: i18nValidationMessage('errors.VALIDATION.IS_EMAIL') })
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString({ message: i18nValidationMessage('errors.VALIDATION.IS_STRING') })
  @MinLength(6, {
    message: i18nValidationMessage('errors.VALIDATION.MIN_LENGTH'),
  })
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString({ message: i18nValidationMessage('errors.VALIDATION.IS_STRING') })
  first_name: string;

  @ApiProperty({ example: 'Doe' })
  @IsString({ message: i18nValidationMessage('errors.VALIDATION.IS_STRING') })
  last_name: string;
}
