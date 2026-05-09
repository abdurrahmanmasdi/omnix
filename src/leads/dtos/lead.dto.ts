import { ApiPropertyOptional, ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsEmail,
  IsObject,
  IsDateString,
} from 'class-validator';
import { Gender, Priority, LeadStatus, Currency } from '@prisma/client';
import { BaseQueryDto } from '../../common/query/dtos/query.dto';

export class FindLeadsQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;
}

export class CreateLeadDto {
  @ApiProperty({ example: 'John' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName!: string;

  @ApiProperty({ example: '+905551234567' })
  @IsString()
  phoneNumber!: string;

  @ApiProperty({ example: 'Turkey' })
  @IsString()
  country!: string;

  @ApiProperty({ example: 'Europe/Istanbul' })
  @IsString()
  timezone!: string;

  @ApiProperty({ example: 'en' })
  @IsString()
  primaryLanguage!: string;

  @ApiPropertyOptional({ example: 'ar' })
  @IsOptional()
  @IsString()
  preferredLanguage?: string;

  @ApiPropertyOptional({ example: 'Can' })
  @IsOptional()
  @IsString()
  nativeName?: string;

  @ApiPropertyOptional({ example: 'john@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    type: Object,
    example: { instagram: '@johndoe', facebook: 'url' },
  })
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, any>;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  pipelineStageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedAgentId?: string;

  @ApiPropertyOptional({ enum: LeadStatus, default: LeadStatus.NEW })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({ enum: Priority, default: Priority.WARM })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  estimatedValue?: number;

  @ApiPropertyOptional({ enum: Currency, default: Currency.USD })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ example: '2026-08-15T10:00:00Z' })
  @IsOptional()
  @IsDateString()
  expectedServiceDate?: string;

  @ApiPropertyOptional({ example: '2026-05-12T14:30:00Z' })
  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;
}

// Automatically makes all CreateLeadDto fields optional for PATCH requests!
export class UpdateLeadDto extends PartialType(CreateLeadDto) {}
