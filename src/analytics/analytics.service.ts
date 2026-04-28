import { Injectable } from '@nestjs/common';
import { LeadStatus, Priority, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface LeadsBySourceMetric {
  source_id: string | null;
  source_name: string;
  lead_count: number;
}

export interface RecentLeadActivityMetric {
  id: string;
  first_name: string;
  last_name: string;
  status: LeadStatus;
  priority: Priority;
  estimated_value: number | null;
  source_id: string | null;
  source_name: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DashboardStats {
  won_deals: number;
  total_revenue: number;
  lead_conversion_rate: number;
}

export interface DashboardMetrics {
  leads_by_source: LeadsBySourceMetric[];
  recent_activity: RecentLeadActivityMetric[];
  dashboard_stats: DashboardStats;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private toNumber(value: Prisma.Decimal | number | null | undefined): number {
    if (value == null) {
      return 0;
    }

    return Number(value);
  }

  private toNullableNumber(
    value: Prisma.Decimal | number | null | undefined,
  ): number | null {
    if (value == null) {
      return null;
    }

    return Number(value);
  }

  async getDashboardStats(
    orgId: string,
    agent_id?: string,
  ): Promise<DashboardStats> {
    const assignmentWhere: Prisma.LeadWhereInput = agent_id
      ? { assigned_agent_id: agent_id }
      : {};

    const [totalLeads, wonDeals, wonDealsRevenue] = await Promise.all([
      this.prisma.lead.count({
        where: assignmentWhere,
      }),
      this.prisma.lead.count({
        where: {
          ...assignmentWhere,
          status: LeadStatus.WON,
        },
      }),
      this.prisma.lead.aggregate({
        where: {
          ...assignmentWhere,
          status: LeadStatus.WON,
        },
        _sum: {
          estimated_value: true,
        },
      }),
    ]);

    const lead_conversion_rate =
      totalLeads === 0 ? 0 : (wonDeals / totalLeads) * 100;

    return {
      won_deals: wonDeals,
      total_revenue: this.toNumber(wonDealsRevenue._sum.estimated_value),
      lead_conversion_rate,
    };
  }

  async getDashboardMetrics(
    orgId: string,
    agent_id?: string,
  ): Promise<DashboardMetrics> {
    const leadWhere: Prisma.LeadWhereInput = agent_id
      ? { assigned_agent_id: agent_id }
      : {};

    const [sourceGroups, sources, recentLeads, dashboardStats] =
      await Promise.all([
        this.prisma.lead.groupBy({
          by: ['source_id'],
          where: leadWhere,
          _count: {
            _all: true,
          },
        }),
        this.prisma.leadSource.findMany({
          where: {},
          select: {
            id: true,
            name: true,
          },
          orderBy: {
            name: 'asc',
          },
        }),
        this.prisma.lead.findMany({
          where: leadWhere,
          orderBy: {
            updated_at: 'desc',
          },
          take: 5,
          select: {
            id: true,
            first_name: true,
            last_name: true,
            status: true,
            priority: true,
            estimated_value: true,
            source_id: true,
            created_at: true,
            updated_at: true,
            source: {
              select: {
                name: true,
              },
            },
          },
        }),
        this.getDashboardStats(orgId, agent_id),
      ]);

    const sourceNameById = new Map(
      sources.map((source) => [source.id, source.name]),
    );

    const leads_by_source: LeadsBySourceMetric[] = sourceGroups.map(
      (group) => ({
        source_id: group.source_id,
        source_name: group.source_id
          ? (sourceNameById.get(group.source_id) ?? 'Unknown Source')
          : 'Unassigned',
        lead_count: group._count._all,
      }),
    );

    const recent_activity: RecentLeadActivityMetric[] = recentLeads.map(
      (lead) => ({
        id: lead.id,
        first_name: lead.first_name,
        last_name: lead.last_name,
        status: lead.status,
        priority: lead.priority,
        estimated_value: this.toNullableNumber(lead.estimated_value),
        source_id: lead.source_id,
        source_name: lead.source?.name ?? null,
        created_at: lead.created_at,
        updated_at: lead.updated_at,
      }),
    );

    return {
      leads_by_source,
      recent_activity,
      dashboard_stats: dashboardStats,
    };
  }
}
