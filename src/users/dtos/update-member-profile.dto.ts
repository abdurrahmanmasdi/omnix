import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsEnum,
  IsArray,
  ArrayNotEmpty,
  IsInt,
  Min,
  Max,
  IsNumber,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AgentTier, AvailabilityStatus } from '@prisma/client';

/**
 * DTO for updating workspace-specific membership profile information.
 * These fields apply to the user's membership in a specific organization.
 */
export class UpdateMemberProfileDto {
  @ApiPropertyOptional({
    description: 'Job title of the member in the organization',
    example: 'Sales Manager',
    type: String,
  })
  @IsOptional()
  @IsString({
    message: 'job_title must be a string',
  })
  @MaxLength(100, {
    message: 'job_title must not exceed 100 characters',
  })
  job_title?: string;

  @ApiPropertyOptional({
    description: 'Agent tier/level in the organization',
    enum: ['JUNIOR', 'STANDARD', 'SENIOR', 'MANAGER'],
    example: 'STANDARD',
  })
  @IsOptional()
  @IsEnum(['JUNIOR', 'STANDARD', 'SENIOR', 'MANAGER'], {
    message: 'agent_tier must be one of: JUNIOR, STANDARD, SENIOR, MANAGER',
  })
  agent_tier?: AgentTier;

  @ApiProperty({ type: [String], isArray: true, required: false })
  @IsOptional()
  @IsArray({
    message: 'specializations must be an array of strings',
  })
  @ArrayNotEmpty({
    message: 'specializations array cannot be empty when provided',
  })
  @IsString({
    each: true,
    message: 'each specialization must be a string',
  })
  @MaxLength(50, {
    each: true,
    message: 'each specialization must not exceed 50 characters',
  })
  specializations?: string[];

  @ApiPropertyOptional({
    description: 'Availability status of the member',
    enum: ['ACTIVE', 'ON_LEAVE', 'OFF_SHIFT'],
    example: 'ACTIVE',
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'ON_LEAVE', 'OFF_SHIFT'], {
    message: 'availability_status must be one of: ACTIVE, ON_LEAVE, OFF_SHIFT',
  })
  availability_status?: AvailabilityStatus;

  @ApiPropertyOptional({
    description: 'Maximum number of active leads this member can handle',
    example: 50,
    type: Number,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({
    message: 'max_active_leads must be an integer',
  })
  @Min(1, {
    message: 'max_active_leads must be at least 1',
  })
  max_active_leads?: number;

  @ApiPropertyOptional({
    description: 'Commission rate as a percentage (0-100)',
    example: 15.5,
    type: Number,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message: 'commission_rate must be a number with up to 2 decimal places',
    },
  )
  @Min(0, {
    message: 'commission_rate must be at least 0',
  })
  @Max(100, {
    message: 'commission_rate must not exceed 100',
  })
  commission_rate?: number;

  @ApiPropertyOptional({
    description: 'Monthly revenue target for this member',
    example: 10000,
    type: Number,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message:
        'monthly_revenue_target must be a number with up to 2 decimal places',
    },
  )
  @Min(0, {
    message: 'monthly_revenue_target must be at least 0',
  })
  monthly_revenue_target?: number;
}
