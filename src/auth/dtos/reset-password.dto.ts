import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class ResetPasswordDto {
  @ApiProperty({ example: 'raw_reset_token' })
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  token: string;

  @ApiProperty({ example: 'newSecurePassword123' })
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  @MinLength(6, {
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.MIN_LENGTH'),
  })
  newPassword: string;
}
