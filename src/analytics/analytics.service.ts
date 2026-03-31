import { Injectable } from '@nestjs/common';
import { LeadStatus, Priority, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface PipelineOverviewMetrics {
  total_leads: number;
  total_estimated_value: number;
}

export interface LeadsByStageMetric {
  pipeline_stage_id: string | null;
  stage_name: string;
  lead_count: number;
}

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
  pipeline_stage_id: string | null;
  pipeline_stage_name: string | null;
  source_id: string | null;
  source_name: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DashboardMetrics {
  pipeline_overview: PipelineOverviewMetrics;
  leads_by_stage: LeadsByStageMetric[];
  leads_by_source: LeadsBySourceMetric[];
  recent_activity: RecentLeadActivityMetric[];
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

  async getDashboardMetrics(orgId: string): Promise<DashboardMetrics> {
    const leadWhere: Prisma.LeadWhereInput = {};

    const [
      pipelineOverview,
      stageGroups,
      sourceGroups,
      stages,
      sources,
      recentLeads,
    ] = await Promise.all([
      this.prisma.lead.aggregate({
        where: leadWhere,
        _count: {
          _all: true,
        },
        _sum: {
          estimated_value: true,
        },
      }),
      this.prisma.lead.groupBy({
        by: ['pipeline_stage_id'],
        where: leadWhere,
        _count: {
          _all: true,
        },
      }),
      this.prisma.lead.groupBy({
        by: ['source_id'],
        where: leadWhere,
        _count: {
          _all: true,
        },
      }),
      this.prisma.pipelineStage.findMany({
        where: {},
        select: {
          id: true,
          name: true,
          order_index: true,
        },
        orderBy: {
          order_index: 'asc',
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
          pipeline_stage_id: true,
          source_id: true,
          created_at: true,
          updated_at: true,
          pipeline_stage: {
            select: {
              name: true,
            },
          },
          source: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    const stageNameById = new Map(
      stages.map((stage) => [stage.id, stage.name]),
    );
    const sourceNameById = new Map(
      sources.map((source) => [source.id, source.name]),
    );

    const leads_by_stage: LeadsByStageMetric[] = stageGroups.map((group) => ({
      pipeline_stage_id: group.pipeline_stage_id,
      stage_name: group.pipeline_stage_id
        ? (stageNameById.get(group.pipeline_stage_id) ?? 'Unknown Stage')
        : 'Unassigned',
      lead_count: group._count._all,
    }));

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
        pipeline_stage_id: lead.pipeline_stage_id,
        pipeline_stage_name: lead.pipeline_stage?.name ?? null,
        source_id: lead.source_id,
        source_name: lead.source?.name ?? null,
        created_at: lead.created_at,
        updated_at: lead.updated_at,
      }),
    );

    return {
      pipeline_overview: {
        total_leads: pipelineOverview._count._all,
        total_estimated_value: this.toNumber(
          pipelineOverview._sum.estimated_value,
        ),
      },
      leads_by_stage,
      leads_by_source,
      recent_activity,
    };
  }
}
