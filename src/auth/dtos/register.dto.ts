import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
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

  @ApiProperty({
    example: '8f31aee2d5210bcf2a452f4c7c68f4dfc84f057d55f4a4d1389d8b02cf30c5f2',
    required: false,
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('errors.VALIDATION.IS_STRING') })
  inviteToken?: string;
}
