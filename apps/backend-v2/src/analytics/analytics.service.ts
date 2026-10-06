import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsSummaryDto } from './dto/analytics-summary.dto';
import { LeadStatus } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(organizationId: string): Promise<AnalyticsSummaryDto> {
    // 1. Total Leads
    const totalLeads = await this.prisma.lead.count({
      where: { organizationId },
    });

    // 2. Active Conversations (QUALIFYING or NEW)
    const activeConversations = await this.prisma.lead.count({
      where: {
        organizationId,
        status: { in: [LeadStatus.QUALIFYING, LeadStatus.NEW] },
      },
    });

    // 3. Needs Attention (HANDED_OFF)
    const needsAttention = await this.prisma.lead.count({
      where: {
        organizationId,
        status: LeadStatus.HANDED_OFF,
      },
    });

    // 4. AI Conversion Rate
    const convertedLeads = await this.prisma.lead.count({
      where: {
        organizationId,
        status: { in: [LeadStatus.READY_TO_BOOK, LeadStatus.WON] },
      },
    });

    const aiConversionRate =
      totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

    // 5. Recent Activity
    const recentLeads = await this.prisma.lead.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: {
        pipelineStage: true,
      },
    });

    const recentActivity = recentLeads.map((lead) => ({
      id: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      status: lead.status,
      pipelineStageName: lead.pipelineStage?.name || 'Unassigned',
      updatedAt: lead.updatedAt,
    }));

    return {
      totalLeads,
      activeConversations,
      needsAttention,
      aiConversionRate,
      recentActivity,
    };
  }
}
