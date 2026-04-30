import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus, Prisma } from '@prisma/client';
import { AppPermission } from '../constants/permissions.registry';
import { PermissionsService } from '../auth/services/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BulkUpdateLeadDataDto,
  BulkUpdateLeadsDto,
} from './dtos/bulk-update-leads.dto';
import { CreateLeadDto } from './dtos/create-lead.dto';
import { UpdateLeadDto } from './dtos/update-lead.dto';
import { I18nService } from 'nestjs-i18n';
import { QueryBuilderService } from '../common/query/query-builder.service';
import { FindLeadsQueryDto } from './dtos/find-leads-query.dto';
import { BulkCreateLeadsDto } from './dtos/bulk-create-leads.dto';

export interface FindLeadsResult {
  data: LeadWithRelations[];
  meta: any;
}

export interface BulkUpdateLeadsResult {
  updated_count: number;
}

const LEAD_ASSIGNED_AGENT_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
  email: true,
} as const;

const LEAD_RELATIONS_INCLUDE = {
  assigned_agent: {
    select: LEAD_ASSIGNED_AGENT_SELECT,
  },
  source: true,
  pipeline_stage: true,
} as const;

export type LeadWithRelations = Prisma.LeadGetPayload<{
  include: typeof LEAD_RELATIONS_INCLUDE;
}>;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    private readonly i18n: I18nService,
    private readonly queryBuilder: QueryBuilderService,
  ) {}

  async create(
    organizationId: string,
    _userId: string,
    dto: CreateLeadDto,
  ): Promise<LeadWithRelations> {
    await this.validateScopedReferences(organizationId, dto);

    return this.prisma.lead.create({
      data: {
        organization_id: organizationId,
        pipeline_stage_id: dto.pipeline_stage_id,
        assigned_agent_id: dto.assigned_agent_id,
        source_id: dto.source_id,
        first_name: dto.first_name,
        last_name: dto.last_name,
        native_name: dto.native_name,
        gender: dto.gender,
        email: dto.email,
        phone_number: dto.phone_number,
        country: dto.country,
        timezone: dto.timezone,
        primary_language: dto.primary_language,
        preferred_language: dto.preferred_language,
        social_links: dto.social_links as Prisma.InputJsonValue,
        status: dto.status,
        priority: dto.priority,
        estimated_value: dto.estimated_value,
        currency: dto.currency,
        expected_service_date: dto.expected_service_date
          ? new Date(dto.expected_service_date)
          : dto.expected_service_date,
        next_follow_up_at: dto.next_follow_up_at
          ? new Date(dto.next_follow_up_at)
          : dto.next_follow_up_at,
      },
      include: LEAD_RELATIONS_INCLUDE,
    });
  }

  async findAll(
    organizationId: string,
    userId: string,
    filters: FindLeadsQueryDto = {},
  ): Promise<{ data: LeadWithRelations[]; meta: any }> {
    const canReadAllLeads = await this.canReadAllLeads(organizationId, userId);

    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 20;

    const config = {
      allowedFilterFields: [
        'status',
        'priority',
        'source_id',
        'assigned_agent_id',
        'country',
        'first_name',
        'last_name',
        'email',
        'estimated_value',
        'created_at',
        'pipeline_stage_id',
      ],
      allowedSortFields: [
        'created_at',
        'first_name',
        'estimated_value',
        'status',
        'priority',
        'assigned_agent.first_name',
        'pipeline_stage.order_index',
      ],
      uuidFields: ['source_id', 'assigned_agent_id', 'pipeline_stage_id'],
      numberFields: ['estimated_value'],
    };

    const orderBy = this.queryBuilder.buildOrderBy(filters.sorts, config);
    const dynamicWhere = this.queryBuilder.buildWhere(filters.filters, config);

    const dynamicConditions: Prisma.LeadWhereInput[] = [];

    if (!canReadAllLeads) {
      dynamicConditions.push({ assigned_agent_id: userId });
    }

    if (filters.status) {
      dynamicConditions.push({ status: filters.status });
    }

    if (filters.priority) {
      dynamicConditions.push({ priority: filters.priority });
    }

    if (Object.keys(dynamicWhere).length > 0) {
      dynamicConditions.push(dynamicWhere);
    }

    const where: Prisma.LeadWhereInput = {
      ...(dynamicConditions.length > 0 ? { AND: dynamicConditions } : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        include: LEAD_RELATIONS_INCLUDE,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async exportAll(
    organizationId: string,
    userId: string,
    filters: FindLeadsQueryDto = {},
  ): Promise<LeadWithRelations[]> {
    const canReadAllLeads = await this.canReadAllLeads(organizationId, userId);

    const config = {
      allowedFilterFields: [
        'status',
        'priority',
        'source_id',
        'assigned_agent_id',
        'country',
        'first_name',
        'last_name',
        'email',
        'estimated_value',
        'created_at',
        'pipeline_stage_id',
      ],
      allowedSortFields: [
        'created_at',
        'first_name',
        'estimated_value',
        'status',
        'priority',
        'assigned_agent.first_name',
        'pipeline_stage.order_index',
      ],
      uuidFields: ['source_id', 'assigned_agent_id', 'pipeline_stage_id'],
      numberFields: ['estimated_value'],
    };

    const orderBy = this.queryBuilder.buildOrderBy(filters.sorts, config);
    const dynamicWhere = this.queryBuilder.buildWhere(filters.filters, config);

    const dynamicConditions: Prisma.LeadWhereInput[] = [];

    if (!canReadAllLeads) {
      dynamicConditions.push({ assigned_agent_id: userId });
    }

    if (filters.status) {
      dynamicConditions.push({ status: filters.status });
    }

    if (filters.priority) {
      dynamicConditions.push({ priority: filters.priority });
    }

    if (Object.keys(dynamicWhere).length > 0) {
      dynamicConditions.push(dynamicWhere);
    }

    const where: Prisma.LeadWhereInput = {
      ...(dynamicConditions.length > 0 ? { AND: dynamicConditions } : {}),
    };

    return this.prisma.lead.findMany({
      where,
      include: LEAD_RELATIONS_INCLUDE,
      orderBy,
    });
  }

  async findOne(
    organizationId: string,
    userId: string,
    leadId: string,
  ): Promise<LeadWithRelations> {
    const canReadAllLeads = await this.canReadAllLeads(organizationId, userId);

    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        ...(canReadAllLeads ? {} : { assigned_agent_id: userId }),
      },
      include: LEAD_RELATIONS_INCLUDE,
    });

    if (!lead) {
      if (!canReadAllLeads) {
        const existsInOrganization = await this.prisma.lead.findFirst({
          where: {
            id: leadId,
          },
          select: { id: true },
        });

        if (existsInOrganization) {
          throw new ForbiddenException(
            this.i18n.t('leads.ERRORS.ACCESS_FORBIDDEN'),
          );
        }
      }

      throw new NotFoundException(this.i18n.t('leads.ERRORS.NOT_FOUND'));
    }

    return lead;
  }

  async update(
    organizationId: string,
    leadId: string,
    dto: UpdateLeadDto,
  ): Promise<LeadWithRelations> {
    await this.validateScopedReferences(organizationId, dto);

    const data = this.buildUpdateData(dto);

    if (Object.keys(data).length === 0) {
      const lead = await this.prisma.lead.findFirst({
        where: {
          id: leadId,
        },
        include: LEAD_RELATIONS_INCLUDE,
      });

      if (!lead) {
        throw new NotFoundException(this.i18n.t('leads.ERRORS.NOT_FOUND'));
      }

      return lead;
    }

    const result = await this.prisma.lead.updateMany({
      where: {
        id: leadId,
      },
      data,
    });

    if (result.count === 0) {
      throw new NotFoundException(this.i18n.t('leads.ERRORS.NOT_FOUND'));
    }

    const updatedLead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
      },
      include: LEAD_RELATIONS_INCLUDE,
    });

    if (!updatedLead) {
      throw new NotFoundException(this.i18n.t('leads.ERRORS.NOT_FOUND'));
    }

    return updatedLead;
  }

  async bulkCreate(
    organizationId: string,
    _userId: string,
    dto: BulkCreateLeadsDto,
  ): Promise<{ count: number }> {
    await this.validateScopedReferences(organizationId, {
      assigned_agent_id: dto.leads.find((lead) => lead.assigned_agent_id)
        ?.assigned_agent_id,
      source_id: dto.leads.find((lead) => lead.source_id)?.source_id,
      pipeline_stage_id: dto.leads.find((lead) => lead.pipeline_stage_id)
        ?.pipeline_stage_id,
    });

    const mappedLeads: Prisma.LeadCreateManyInput[] = dto.leads.map((lead) => ({
      organization_id: organizationId,
      pipeline_stage_id: lead.pipeline_stage_id,
      assigned_agent_id: lead.assigned_agent_id,
      source_id: lead.source_id,
      first_name: lead.first_name,
      last_name: lead.last_name,
      native_name: lead.native_name,
      gender: lead.gender,
      email: lead.email,
      phone_number: lead.phone_number,
      country: lead.country,
      timezone: lead.timezone,
      primary_language: lead.primary_language,
      preferred_language: lead.preferred_language,
      social_links: lead.social_links as Prisma.InputJsonValue,
      status: lead.status,
      priority: lead.priority,
      estimated_value: lead.estimated_value,
      currency: lead.currency,
      expected_service_date: lead.expected_service_date
        ? new Date(lead.expected_service_date)
        : lead.expected_service_date,
      next_follow_up_at: lead.next_follow_up_at
        ? new Date(lead.next_follow_up_at)
        : lead.next_follow_up_at,
    }));

    const result = await this.prisma.lead.createMany({
      data: mappedLeads,
      skipDuplicates: true,
    });

    return {
      count: result.count,
    };
  }

  async bulkUpdate(
    organizationId: string,
    userId: string,
    dto: BulkUpdateLeadsDto,
  ): Promise<BulkUpdateLeadsResult> {
    await this.validateScopedReferences(organizationId, {
      assigned_agent_id: dto.update_data.assigned_agent_id,
    });

    const data = this.buildBulkUpdateData(dto.update_data);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(this.i18n.t('leads.ERRORS.BAD_REQUEST'));
    }

    const canEditAllLeads = await this.canEditAllLeads(organizationId, userId);

    const where: Prisma.LeadWhereInput = {
      id: { in: dto.lead_ids },
      ...(canEditAllLeads ? {} : { assigned_agent_id: userId }),
    };

    const result = await this.prisma.lead.updateMany({
      where,
      data,
    });

    return {
      updated_count: result.count,
    };
  }

  async remove(organizationId: string, leadId: string): Promise<void> {
    const result = await this.prisma.lead.deleteMany({
      where: {
        id: leadId,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException(this.i18n.t('leads.ERRORS.NOT_FOUND'));
    }
  }

  private buildUpdateData(
    dto: UpdateLeadDto,
  ): Prisma.LeadUncheckedUpdateManyInput {
    return {
      ...this.pickDefined<Prisma.LeadUncheckedUpdateManyInput>({
        first_name: dto.first_name,
        last_name: dto.last_name,
        native_name: dto.native_name,
        gender: dto.gender,
        email: dto.email,
        phone_number: dto.phone_number,
        country: dto.country,
        timezone: dto.timezone,
        primary_language: dto.primary_language,
        preferred_language: dto.preferred_language,
        social_links: dto.social_links as Prisma.InputJsonValue | undefined,
        status: dto.status,
        priority: dto.priority,
        estimated_value: dto.estimated_value,
        currency: dto.currency,
        pipeline_stage_id: dto.pipeline_stage_id,
        assigned_agent_id: dto.assigned_agent_id,
        source_id: dto.source_id,
      }),
      ...this.pickDefined<Prisma.LeadUncheckedUpdateManyInput>({
        expected_service_date: this.toNullableDate(dto.expected_service_date),
        next_follow_up_at: this.toNullableDate(dto.next_follow_up_at),
      }),
    };
  }

  private buildBulkUpdateData(
    dto: BulkUpdateLeadDataDto,
  ): Prisma.LeadUncheckedUpdateManyInput {
    return this.pickDefined<Prisma.LeadUncheckedUpdateManyInput>({
      status: dto.status,
      priority: dto.priority,
      assigned_agent_id: dto.assigned_agent_id,
      pipeline_stage_id: dto.pipeline_stage_id,
    });
  }

  private pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
    return Object.fromEntries(
      Object.entries(obj).filter(([, value]) => value !== undefined),
    ) as Partial<T>;
  }

  private toNullableDate(value?: string | null): Date | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    return value ? new Date(value) : null;
  }

  private async validateScopedReferences(
    organizationId: string,
    dto: {
      source_id?: string | null;
      assigned_agent_id?: string | null;
      pipeline_stage_id?: string | null;
    },
  ): Promise<void> {
    if (dto.source_id) {
      await this.assertSourceInOrganization(organizationId, dto.source_id);
    }

    if (dto.assigned_agent_id) {
      await this.assertAssignedAgentInOrganization(
        organizationId,
        dto.assigned_agent_id,
      );
    }

    if (dto.pipeline_stage_id) {
      await this.assertPipelineStageInOrganization(
        organizationId,
        dto.pipeline_stage_id,
      );
    }
  }

  private async assertPipelineStageInOrganization(
    organizationId: string,
    pipelineStageId: string,
  ): Promise<void> {
    const stage = await this.prisma.pipelineStage.findFirst({
      where: {
        id: pipelineStageId,
      },
      select: { id: true },
    });

    if (!stage) {
      throw new BadRequestException(
        this.i18n.t('leads.ERRORS.PIPELINE_STAGE_OUTSIDE_SCOPE', {
          defaultValue: 'Pipeline stage not found',
        }),
      );
    }
  }

  private async assertSourceInOrganization(
    organizationId: string,
    sourceId: string,
  ): Promise<void> {
    const source = await this.prisma.leadSource.findFirst({
      where: {
        id: sourceId,
      },
      select: { id: true, is_active: true },
    });

    if (!source) {
      throw new BadRequestException(
        this.i18n.t('leads.ERRORS.SOURCE_OUTSIDE_SCOPE'),
      );
    }

    if (!source.is_active) {
      throw new BadRequestException(
        this.i18n.t('leads.ERRORS.SOURCE_INACTIVE'),
      );
    }
  }

  private async assertAssignedAgentInOrganization(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        user_id: userId,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new BadRequestException(
        this.i18n.t('leads.ERRORS.ASSIGNED_AGENT_OUTSIDE_SCOPE'),
      );
    }
  }

  private async canReadAllLeads(
    organizationId: string,
    userId: string,
  ): Promise<boolean> {
    const permissions = await this.permissionsService.getEffectivePermissions(
      userId,
      organizationId,
    );

    return this.hasAnyPermission(permissions, [
      AppPermission.LEADS_READ_ALL,
      AppPermission.LEADS_MANAGE,
      AppPermission.TEAM_MEMBERS_MANAGE,
      AppPermission.ORGANIZATION_MANAGE,
    ]);
  }

  private async canEditAllLeads(
    organizationId: string,
    userId: string,
  ): Promise<boolean> {
    const permissions = await this.permissionsService.getEffectivePermissions(
      userId,
      organizationId,
    );

    return this.hasAnyPermission(permissions, [
      AppPermission.LEADS_EDIT_ALL,
      AppPermission.LEADS_MANAGE,
      AppPermission.TEAM_MEMBERS_MANAGE,
      AppPermission.ORGANIZATION_MANAGE,
    ]);
  }

  private hasAnyPermission(
    effectivePermissions: string[],
    requiredPermissions: string[],
  ): boolean {
    return requiredPermissions.some((permission) =>
      this.hasPermission(effectivePermissions, permission),
    );
  }

  private hasPermission(
    effectivePermissions: string[],
    permission: string,
  ): boolean {
    if (effectivePermissions.includes('*')) {
      return true;
    }

    if (effectivePermissions.includes(permission)) {
      return true;
    }

    const namespace = permission.split(':')[0];
    return Boolean(
      namespace && effectivePermissions.includes(`${namespace}:*`),
    );
  }
}
