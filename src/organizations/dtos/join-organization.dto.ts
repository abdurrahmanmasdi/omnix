import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';

export class JoinOrganizationDto {
  @ApiProperty({
    example: 'acme-corporation',
    description: 'The URL-friendly slug of the organization to join',
  })
  @IsString({ message: i18nValidationMessage('errors.VALIDATION.IS_STRING') })
  @MinLength(3, {
    message: i18nValidationMessage('errors.VALIDATION.MIN_LENGTH'),
  })
  @MaxLength(255, {
    message: i18nValidationMessage('errors.VALIDATION.MAX_LENGTH'),
  })
  slug: string;
}
