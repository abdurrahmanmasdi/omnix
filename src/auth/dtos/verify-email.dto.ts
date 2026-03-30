import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class VerifyEmailDto {
  @ApiProperty({ example: 'raw_verification_token' })
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  token: string;
}
