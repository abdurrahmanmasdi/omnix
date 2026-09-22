import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStatus, Priority, Currency } from '@prisma/client';

export class LeadResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty()
  phoneNumber!: string;

  @ApiProperty()
  country!: string;

  @ApiProperty()
  timezone!: string;

  @ApiProperty()
  primaryLanguage!: string;

  @ApiPropertyOptional()
  preferredLanguage?: string;

  @ApiPropertyOptional()
  nativeName?: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional({ type: Object })
  socialLinks?: Record<string, any>;

  @ApiPropertyOptional()
  gender?: string;

  @ApiPropertyOptional()
  sourceId?: string;

  @ApiPropertyOptional()
  pipelineStageId?: string;

  @ApiPropertyOptional()
  assignedAgentId?: string;

  @ApiProperty({ enum: LeadStatus })
  status!: LeadStatus;

  @ApiProperty({ enum: Priority })
  priority!: Priority;

  @ApiPropertyOptional()
  estimatedValue?: number;

  @ApiPropertyOptional({ enum: Currency })
  currency?: Currency;

  @ApiPropertyOptional()
  expectedServiceDate?: string;

  @ApiPropertyOptional()
  nextFollowUpAt?: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiPropertyOptional()
  deletedAt?: string;

  @ApiPropertyOptional()
  conversation?: any; // To allow related data
}

export class LeadsPaginatedResponseDto {
  @ApiProperty({ type: [LeadResponseDto] })
  data!: LeadResponseDto[];

  @ApiProperty()
  meta!: any;
}
