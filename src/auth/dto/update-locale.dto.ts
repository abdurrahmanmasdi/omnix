import { ApiProperty } from '@nestjs/swagger';
import { UserLocale } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateLocaleDto {
  @ApiProperty({ enum: UserLocale, enumName: 'UserLocale' })
  @IsEnum(UserLocale)
  locale!: UserLocale;
}
export class LocaleResponseDto {
  @ApiProperty({ enum: UserLocale, enumName: 'UserLocale', nullable: true })
  locale!: UserLocale | null;
}
