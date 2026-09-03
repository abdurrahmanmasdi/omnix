import { ApiProperty } from '@nestjs/swagger';

export class RecentActivityDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  pipelineStageName: string;

  @ApiProperty()
  updatedAt: Date;
}

export class AnalyticsSummaryDto {
  @ApiProperty()
  totalLeads: number;

  @ApiProperty()
  activeConversations: number;

  @ApiProperty()
  needsAttention: number;

  @ApiProperty()
  aiConversionRate: number; // Percentage 0-100

  @ApiProperty({ type: [RecentActivityDto] })
  recentActivity: RecentActivityDto[];
}
