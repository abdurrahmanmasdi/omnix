import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Currency, Gender, LeadStatus, Priority } from '@prisma/client';

export class UpdateLeadDto {
  @ApiProperty({ example: 'John', required: false })
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiProperty({ example: 'Doe', required: false })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiProperty({ example: '+905551112233', required: false })
  @IsOptional()
  @IsString()
  phone_number?: string;

  @ApiProperty({ example: 'Turkey', required: false })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ example: 'Europe/Istanbul', required: false })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ example: 'tr', required: false })
  @IsOptional()
  @IsString()
  primary_language?: string;

  @ApiProperty({ example: 'Ahmet', required: false, nullable: true })
  @IsOptional()
  @IsString()
  native_name?: string | null;

  @ApiProperty({ enum: Gender, required: false })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({
    example: 'john.doe@company.com',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiProperty({ example: 'en', required: false, nullable: true })
  @IsOptional()
  @IsString()
  preferred_language?: string | null;

  @ApiProperty({
    example: { linkedin: 'https://linkedin.com/in/johndoe' },
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsObject()
  social_links?: Record<string, unknown> | null;

  @ApiProperty({ enum: LeadStatus, required: false })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiProperty({ enum: Priority, required: false })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiProperty({
    example: '15000.50',
    description: 'Decimal value represented as string to preserve precision',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsNumberString()
  estimated_value?: string | null;

  @ApiProperty({ enum: Currency, required: false })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiProperty({
    example: '2026-04-10T09:00:00.000Z',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  expected_service_date?: string | null;

  @ApiProperty({
    example: '2026-04-01T12:00:00.000Z',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  next_follow_up_at?: string | null;

  @ApiProperty({
    example: 'f9ce8f72-9ec8-4db0-bf07-614ec2ec6143',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID('4')
  assigned_agent_id?: string | null;

  @ApiProperty({
    example: 'c9a3874e-ebed-4fdf-8c14-f299f4d75668',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID('4')
  source_id?: string | null;
}
