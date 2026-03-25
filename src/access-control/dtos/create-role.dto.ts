import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateRoleDto {
  @ApiProperty({
    description: 'Name of the role',
    example: 'Senior Manager',
  })
  @IsString({ message: i18nValidationMessage('errors.VALIDATION.IS_STRING') })
  @MinLength(2, {
    message: i18nValidationMessage('errors.VALIDATION.MIN_LENGTH'),
  })
  @MaxLength(100, {
    message: i18nValidationMessage('errors.VALIDATION.MAX_LENGTH'),
  })
  name: string;
}
