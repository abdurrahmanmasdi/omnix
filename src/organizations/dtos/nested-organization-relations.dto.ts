import { IsString, IsUrl, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateSocialLinkDto {
  @ApiProperty({
    example: 'INSTAGRAM',
    description: 'Social platform name',
  })
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  platform: string;

  @ApiProperty({
    example: 'https://instagram.com/acmecorp',
    description: 'URL to social media profile',
  })
  @IsUrl()
  url: string;
}

export class CreateBankAccountDto {
  @ApiProperty({
    example: 'Bank of Example',
    description: 'Bank name',
  })
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  bank_name: string;

  @ApiProperty({
    example: 'DE89370400440532013000',
    description: 'IBAN number',
  })
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  iban: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'Account holder name',
  })
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  account_holder_name: string;

  @ApiProperty({
    example: 'EUR',
    description: 'Account currency',
    required: false,
    default: 'USD',
  })
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  currency?: string;

  @ApiProperty({
    example: true,
    description: 'Whether this is the default account',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_BOOLEAN'),
  })
  is_default?: boolean;
}
