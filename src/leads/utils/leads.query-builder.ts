import { BadRequestException, Injectable } from '@nestjs/common';
import { LeadStatus, Prisma, Priority } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';

export interface DynamicFilterRule {
  field: string;
  operator: string;
  value: unknown;
}

export const ALLOWED_FILTER_FIELDS = [
  'status',
  'priority',
  'source_id',
  'assigned_agent_id',
  'country',
  'pipeline_stage_id',
] as const;

export type AllowedFilterField = (typeof ALLOWED_FILTER_FIELDS)[number];

export const UUID_FILTER_FIELDS = [
  'source_id',
  'assigned_agent_id',
  'pipeline_stage_id',
] as const;

export type UuidFilterField = (typeof UUID_FILTER_FIELDS)[number];

export const ALLOWED_SORT_FIELDS = [
  'created_at',
  'first_name',
  'estimated_value',
  'status',
  'priority',
] as const;

export type AllowedSortField = (typeof ALLOWED_SORT_FIELDS)[number];

@Injectable()
export class LeadsQueryBuilder {
  constructor(private readonly i18n: I18nService) {}

  public buildOrderBy(
    sortByRaw?: string,
    sortDirRaw?: string,
  ): Prisma.LeadOrderByWithRelationInput {
    const sortBy = this.resolveSortField(sortByRaw);
    const sortDir = this.resolveSortDirection(sortDirRaw);

    return {
      [sortBy]: sortDir,
    } as Prisma.LeadOrderByWithRelationInput;
  }

  private resolveSortField(sortByRaw?: string): AllowedSortField {
    if (!sortByRaw) {
      return 'created_at';
    }

    const normalized = sortByRaw.trim().toLowerCase();

    return this.isAllowedSortField(normalized) ? normalized : 'created_at';
  }

  private resolveSortDirection(sortDirRaw?: string): Prisma.SortOrder {
    return sortDirRaw?.trim().toLowerCase() === 'asc' ? 'asc' : 'desc';
  }

  private isAllowedSortField(field: string): field is AllowedSortField {
    return (ALLOWED_SORT_FIELDS as readonly string[]).includes(field);
  }

  public parseDynamicFilterRules(filtersRaw?: string): DynamicFilterRule[] {
    if (!filtersRaw) {
      return [];
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(filtersRaw);
    } catch {
      throw new BadRequestException(
        this.i18n.t('leads.ERRORS.INVALID_FILTERS'),
      );
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException(
        this.i18n.t('leads.ERRORS.INVALID_FILTERS'),
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

  public buildDynamicFilterCondition(
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
          this.i18n.t('leads.ERRORS.INVALID_FILTERS'),
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
        this.i18n.t('leads.ERRORS.INVALID_FILTERS'),
      );
    }

    if (field === 'priority') {
      if (typeof value === 'string' && this.isLeadPriority(value)) {
        return value;
      }

      throw new BadRequestException(
        this.i18n.t('leads.ERRORS.INVALID_FILTERS'),
      );
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(
        this.i18n.t('leads.ERRORS.INVALID_FILTERS'),
      );
    }

    const trimmedValue = value.trim();

    if (!trimmedValue) {
      throw new BadRequestException(
        this.i18n.t('leads.ERRORS.INVALID_FILTERS'),
      );
    }

    if (this.isUuidFilterField(field) && !this.isUuid(trimmedValue)) {
      throw new BadRequestException(
        this.i18n.t('leads.ERRORS.INVALID_FILTERS'),
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
