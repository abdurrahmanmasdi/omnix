import {
  IsString,
  IsOptional,
  IsBoolean,
  MinLength,
  MaxLength,
  IsObject,
  IsUrl,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  CreateSocialLinkDto,
  CreateBankAccountDto,
} from './nested-organization-relations.dto';

export class CreateOrganizationDto {
  @ApiProperty({
    example: 'Acme Corporation',
    description: 'The name of the organization',
  })
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  @MinLength(3, {
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.MIN_LENGTH'),
  })
  @MaxLength(255, {
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.MAX_LENGTH'),
  })
  name: string;

  @ApiProperty({
    example: true,
    description: 'Whether the organization is publicly visible',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_BOOLEAN'),
  })
  is_public?: boolean;


  @ApiProperty({
    example: '1234567890',
    description: 'Tax identification number',
    required: false,
  })
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  tax_number?: string;

  @ApiProperty({
    example: 'Tax Office Name',
    description: 'Tax office location',
    required: false,
  })
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  tax_office?: string;

  @ApiProperty({
    example: 'https://example.com/logo.png',
    description: 'URL to organization logo',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  logo_url?: string;

  @ApiProperty({
    example: { primary: '#FF0000', secondary: '#00FF00' },
    description: 'Brand colors (hex values)',
    required: false,
  })
  @IsOptional()
  @IsObject({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_OBJECT'),
  })
  brand_colors?: Record<string, string>;

  @ApiProperty({
    example: 'USD',
    description: 'Default currency for organization',
    required: false,
    default: 'USD',
  })
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  default_currency?: string;

  @ApiProperty({
    example: 'Technology',
    description: 'Industry category',
    required: false,
  })
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  industry_category?: string;

  @ApiProperty({
    example: '123 Main St, City, Country',
    description: 'Physical address of organization',
    required: false,
  })
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  address?: string;

  @ApiProperty({
    example: 'https://www.example.com',
    description: 'Organization website URL',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  website_url?: string;

  @ApiProperty({
    example: 'info@example.com',
    description: 'Public email address',
    required: false,
  })
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  public_email?: string;

  @ApiProperty({
    example: '+1-555-0000',
    description: 'Public phone number',
    required: false,
  })
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  public_phone?: string;

  @ApiProperty({
    example: 'Terms and conditions text...',
    description: 'Terms and conditions',
    required: false,
  })
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  terms_and_conditions?: string;

  @ApiProperty({
    example: 'Privacy policy text...',
    description: 'Privacy policy',
    required: false,
  })
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('auth.ERRORS.VALIDATION.IS_STRING'),
  })
  privacy_policy?: string;

  @ApiProperty({
    type: Array,
    description: 'Social media links',
    required: false,
    example: [{ platform: 'INSTAGRAM', url: 'https://instagram.com/acmecorp' }],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSocialLinkDto)
  social_links?: CreateSocialLinkDto[];

  @ApiProperty({
    type: Array,
    description: 'Bank account details',
    required: false,
    example: [
      {
        bank_name: 'Bank of Example',
        iban: 'DE89370400440532013000',
        account_holder_name: 'John Doe',
        currency: 'EUR',
        is_default: true,
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBankAccountDto)
  bank_accounts?: CreateBankAccountDto[];
}
