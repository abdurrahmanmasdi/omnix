import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Lead,
  LeadStatus,
  MembershipStatus,
  Prisma,
  Priority,
} from '@prisma/client';
import { AppPermission } from '../constants/permissions.registry';
import { PermissionsService } from '../auth/services/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './dtos/create-lead.dto';
import { UpdateLeadDto } from './dtos/update-lead.dto';
import { I18nService } from 'nestjs-i18n';

export interface FindLeadsFilters {
  page?: number;
  limit?: number;
  status?: LeadStatus;
  priority?: Priority;
  filters?: string;
}

interface DynamicFilterRule {
  field: string;
  operator: string;
  value: unknown;
}

const ALLOWED_FILTER_FIELDS = [
  'status',
  'priority',
  'source_id',
  'assigned_agent_id',
  'country',
  'pipeline_stage_id',
] as const;

type AllowedFilterField = (typeof ALLOWED_FILTER_FIELDS)[number];

const UUID_FILTER_FIELDS = [
  'source_id',
  'assigned_agent_id',
  'pipeline_stage_id',
] as const;

type UuidFilterField = (typeof UUID_FILTER_FIELDS)[number];

export interface FindLeadsResult {
  data: Lead[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    private readonly i18n: I18nService,
  ) {}

  async create(
    organizationId: string,
    _userId: string,
    dto: CreateLeadDto,
  ): Promise<Lead> {
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
    });
  }

  async findAll(
    organizationId: string,
    userId: string,
    filters: FindLeadsFilters = {},
  ): Promise<FindLeadsResult> {
    const canReadAllLeads = await this.canReadAllLeads(organizationId, userId);

    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 20;

    const dynamicConditions: Prisma.LeadWhereInput[] = [
      { organization_id: organizationId },
    ];

    if (!canReadAllLeads) {
      dynamicConditions.push({ assigned_agent_id: userId });
    }

    if (filters.status) {
      dynamicConditions.push({ status: filters.status });
    }

    if (filters.priority) {
      dynamicConditions.push({ priority: filters.priority });
    }

    const parsedRules = this.parseDynamicFilterRules(filters.filters);

    for (const rule of parsedRules) {
      const condition = this.buildDynamicFilterCondition(rule);

      if (condition) {
        dynamicConditions.push(condition);
      }
    }

    const where: Prisma.LeadWhereInput = {
      AND: dynamicConditions,
    };

    const [total, data] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        orderBy: { created_at: 'desc' },
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

  async findOne(
    organizationId: string,
    userId: string,
    leadId: string,
  ): Promise<Lead> {
    const canReadAllLeads = await this.canReadAllLeads(organizationId, userId);

    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        organization_id: organizationId,
        ...(canReadAllLeads ? {} : { assigned_agent_id: userId }),
      },
    });

    if (!lead) {
      if (!canReadAllLeads) {
        const existsInOrganization = await this.prisma.lead.findFirst({
          where: {
            id: leadId,
            organization_id: organizationId,
          },
          select: { id: true },
        });

        if (existsInOrganization) {
          throw new ForbiddenException(
            this.i18n.t('errors.LEADS.ACCESS_FORBIDDEN'),
          );
        }
      }

      throw new NotFoundException(this.i18n.t('errors.LEADS.NOT_FOUND'));
    }

    return lead;
  }

  async update(
    organizationId: string,
    leadId: string,
    dto: UpdateLeadDto,
  ): Promise<Lead> {
    await this.validateScopedReferences(organizationId, dto);

    const data = this.buildUpdateData(dto);

    if (Object.keys(data).length === 0) {
      const lead = await this.prisma.lead.findFirst({
        where: {
          id: leadId,
          organization_id: organizationId,
        },
      });

      if (!lead) {
        throw new NotFoundException(this.i18n.t('errors.LEADS.NOT_FOUND'));
      }

      return lead;
    }

    const result = await this.prisma.lead.updateMany({
      where: {
        id: leadId,
        organization_id: organizationId,
      },
      data,
    });

    if (result.count === 0) {
      throw new NotFoundException(this.i18n.t('errors.LEADS.NOT_FOUND'));
    }

    const updatedLead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        organization_id: organizationId,
      },
    });

    if (!updatedLead) {
      throw new NotFoundException(this.i18n.t('errors.LEADS.NOT_FOUND'));
    }

    return updatedLead;
  }

  async remove(organizationId: string, leadId: string): Promise<void> {
    const result = await this.prisma.lead.deleteMany({
      where: {
        id: leadId,
        organization_id: organizationId,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException(this.i18n.t('errors.LEADS.NOT_FOUND'));
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
      pipeline_stage_id?: string | null;
      source_id?: string | null;
      assigned_agent_id?: string | null;
    },
  ): Promise<void> {
    if (dto.pipeline_stage_id) {
      await this.assertPipelineStageInOrganization(
        organizationId,
        dto.pipeline_stage_id,
      );
    }

    if (dto.source_id) {
      await this.assertSourceInOrganization(organizationId, dto.source_id);
    }

    if (dto.assigned_agent_id) {
      await this.assertAssignedAgentInOrganization(
        organizationId,
        dto.assigned_agent_id,
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
        organization_id: organizationId,
      },
      select: { id: true },
    });

    if (!stage) {
      throw new BadRequestException(
        this.i18n.t('errors.LEADS.PIPELINE_STAGE_OUTSIDE_SCOPE'),
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
        organization_id: organizationId,
      },
      select: { id: true, is_active: true },
    });

    if (!source) {
      throw new BadRequestException(
        this.i18n.t('errors.LEADS.SOURCE_OUTSIDE_SCOPE'),
      );
    }

    if (!source.is_active) {
      throw new BadRequestException(
        this.i18n.t('errors.LEADS.SOURCE_INACTIVE'),
      );
    }
  }

  private async assertAssignedAgentInOrganization(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organization_id: organizationId,
        user_id: userId,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new BadRequestException(
        this.i18n.t('errors.LEADS.ASSIGNED_AGENT_OUTSIDE_SCOPE'),
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

  private parseDynamicFilterRules(filtersRaw?: string): DynamicFilterRule[] {
    if (!filtersRaw) {
      return [];
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(filtersRaw);
    } catch {
      throw new BadRequestException(
        this.i18n.t('errors.LEADS.INVALID_FILTERS'),
      );
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException(
        this.i18n.t('errors.LEADS.INVALID_FILTERS'),
      );
    }

    return parsed
      .filter(
        (rule): rule is DynamicFilterRule =>
          Boolean(rule) &&
          typeof rule === 'object' &&
          typeof (rule as DynamicFilterRule).field === 'string' &&
          typeof (rule as DynamicFilterRule).operator === 'string' &&
          'value' in (rule as Record<string, unknown>),
      )
      .map((rule) => ({
        field: rule.field,
        operator: rule.operator,
        value: rule.value,
      }));
  }

  private isAllowedFilterField(field: string): field is AllowedFilterField {
    return (ALLOWED_FILTER_FIELDS as readonly string[]).includes(field);
  }

  private buildDynamicFilterCondition(
    rule: DynamicFilterRule,
  ): Prisma.LeadWhereInput | null {
    if (!this.isAllowedFilterField(rule.field)) {
      return null;
    }

    const field: AllowedFilterField = rule.field;

    if (rule.operator === 'equals') {
      const normalizedValue = this.normalizeFilterValue(field, rule.value);

      return {
        [field]: normalizedValue,
      } as Prisma.LeadWhereInput;
    }

    if (rule.operator === 'in') {
      if (!Array.isArray(rule.value)) {
        throw new BadRequestException(
          this.i18n.t('errors.LEADS.INVALID_FILTERS'),
        );
      }

      const normalizedValues = rule.value.map((value) =>
        this.normalizeFilterValue(field, value),
      );

      return {
        [field]: { in: normalizedValues },
      } as Prisma.LeadWhereInput;
    }

    return null;
  }

  private normalizeFilterValue(
    field: AllowedFilterField,
    value: unknown,
  ): string {
    if (field === 'status') {
      if (typeof value === 'string' && this.isLeadStatus(value)) {
        return value;
      }

      throw new BadRequestException(
        this.i18n.t('errors.LEADS.INVALID_FILTERS'),
      );
    }

    if (field === 'priority') {
      if (typeof value === 'string' && this.isLeadPriority(value)) {
        return value;
      }

      throw new BadRequestException(
        this.i18n.t('errors.LEADS.INVALID_FILTERS'),
      );
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(
        this.i18n.t('errors.LEADS.INVALID_FILTERS'),
      );
    }

    const trimmedValue = value.trim();

    if (!trimmedValue) {
      throw new BadRequestException(
        this.i18n.t('errors.LEADS.INVALID_FILTERS'),
      );
    }

    if (this.isUuidFilterField(field) && !this.isUuid(trimmedValue)) {
      throw new BadRequestException(
        this.i18n.t('errors.LEADS.INVALID_FILTERS'),
      );
    }

    return trimmedValue;
  }

  private isUuidFilterField(
    field: AllowedFilterField,
  ): field is UuidFilterField {
    return (UUID_FILTER_FIELDS as readonly string[]).includes(field);
  }

  private isLeadStatus(value: string): value is LeadStatus {
    return (Object.values(LeadStatus) as string[]).includes(value);
  }

  private isLeadPriority(value: string): value is Priority {
    return (Object.values(Priority) as string[]).includes(value);
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
