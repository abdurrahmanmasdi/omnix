import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserLocale } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateBy,
} from 'class-validator';

export class UpdateUserProfileDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/\S/)
  firstName?: string;
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/\S/)
  lastName?: string;
  @ApiPropertyOptional({ description: 'E.164 phone or empty string' })
  @IsOptional()
  @IsString()
  @Matches(/^(?:\+[1-9]\d{6,14})?$/)
  phoneNumber?: string;
  @ApiPropertyOptional({ description: 'E.164 phone or empty string' })
  @IsOptional()
  @IsString()
  @Matches(/^(?:\+[1-9]\d{6,14})?$/)
  whatsappNumber?: string;
  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(50, { each: true })
  spokenLanguages?: string[];
  @ApiPropertyOptional({ enum: UserLocale, enumName: 'UserLocale' })
  @IsOptional()
  @IsEnum(UserLocale)
  locale?: UserLocale;
}
export class ChangePasswordDto {
  @ApiProperty({ maxLength: 72 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  currentPassword!: string;
  @ApiProperty({ minLength: 12, maxLength: 72 })
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  @ValidateBy({
    name: 'passwordBytes',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72,
      defaultMessage: () => 'Password must be at most 72 UTF-8 bytes',
    },
  })
  newPassword!: string;
}
export class ProfileMembershipDto {
  @ApiProperty() canManageTeam!: boolean;
  @ApiProperty() organizationId!: string;
  @ApiProperty() organizationName!: string;
  @ApiProperty() roleName!: string;
  @ApiProperty() status!: string;
}
export class UserProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ type: String, nullable: true }) phoneNumber!: string | null;
  @ApiProperty({ type: String, nullable: true }) whatsappNumber!: string | null;
  @ApiProperty({ type: [String] }) spokenLanguages!: string[];
  @ApiProperty({ enum: UserLocale, enumName: 'UserLocale', nullable: true })
  locale!: UserLocale | null;
  @ApiProperty({ type: [ProfileMembershipDto] })
  memberships!: ProfileMembershipDto[];
}
export class PasswordChangedDto {
  @ApiProperty() access_token!: string;
}
