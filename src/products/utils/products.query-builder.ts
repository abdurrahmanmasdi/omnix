import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductType, Prisma } from '@prisma/client';
// For localization if needed, skipping nestjs-i18n for direct throw or you can inject it:
// import { I18nService } from 'nestjs-i18n';

export interface DynamicFilterRule {
  field: string;
  operator: string;
  value: unknown;
}

export const ALLOWED_FILTER_FIELDS = [
  'type',
  'currency',
  'base_price',
] as const;

export type AllowedFilterField = (typeof ALLOWED_FILTER_FIELDS)[number];

export const ALLOWED_SORT_FIELDS = [
  'created_at',
  'title',
  'base_price',
  'type',
] as const;

export type AllowedSortField = (typeof ALLOWED_SORT_FIELDS)[number];

@Injectable()
export class ProductsQueryBuilder {
  // constructor(private readonly i18n: I18nService) {} // Kept simple
  
  public buildOrderBy(
    sortByRaw?: string,
    sortDirRaw?: string,
  ): Prisma.ProductOrderByWithRelationInput {
    const sortBy = this.resolveSortField(sortByRaw);
    const sortDir = this.resolveSortDirection(sortDirRaw);

    return {
      [sortBy]: sortDir,
    } as Prisma.ProductOrderByWithRelationInput;
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

  private isAllowedFilterField(field: string): field is AllowedFilterField {
    return (ALLOWED_FILTER_FIELDS as readonly string[]).includes(field);
  }

  public parseDynamicFilterRules(filtersRaw?: string): DynamicFilterRule[] {
    if (!filtersRaw) {
      return [];
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(filtersRaw);
    } catch {
      throw new BadRequestException('Invalid filters format');
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException('Filters must be an array');
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

  public buildDynamicFilterCondition(
    rule: DynamicFilterRule,
  ): Prisma.ProductWhereInput | null {
    // Check if it's a specifications query e.g. specifications.bedrooms
    if (rule.field.startsWith('specifications.')) {
      const path = rule.field.split('.').slice(1);
      
      if (rule.operator === 'equals') {
        return {
          specifications: {
            path,
            equals: rule.value as any,
          },
        };
      }
      
      if (rule.operator === 'string_contains') {
         return {
           specifications: {
             path,
             string_contains: String(rule.value),
           }
         };
      }
      
      return null; // Add more operators if needed
    }

    if (!this.isAllowedFilterField(rule.field as any)) {
      return null;
    }

    const field = rule.field as AllowedFilterField;

    if (rule.operator === 'equals') {
      const normalizedValue = this.normalizeFilterValue(field, rule.value);
      return {
        [field]: normalizedValue,
      } as Prisma.ProductWhereInput;
    }

    if (rule.operator === 'in') {
      if (!Array.isArray(rule.value)) {
        throw new BadRequestException('Value must be an array for "in" operator');
      }

      const normalizedValues = rule.value.map((value) =>
        this.normalizeFilterValue(field, value),
      );

      return {
        [field]: { in: normalizedValues },
      } as Prisma.ProductWhereInput;
    }
    
    if (field === 'base_price') {
      if (rule.operator === 'gte') {
        return { base_price: { gte: Number(rule.value) } };
      }
      if (rule.operator === 'lte') {
        return { base_price: { lte: Number(rule.value) } };
      }
    }

    return null;
  }

  private normalizeFilterValue(
    field: AllowedFilterField,
    value: unknown,
  ): any {
    if (field === 'type') {
      if (typeof value === 'string' && this.isProductType(value)) {
        return value;
      }
      throw new BadRequestException('Invalid product type filter');
    }
    
    if (field === 'base_price') {
       const num = Number(value);
       if (!isNaN(num)) {
         return num;
       }
       throw new BadRequestException('Invalid price filter');
    }

    if (typeof value !== 'string') {
      throw new BadRequestException('Invalid filter value');
    }

    const trimmedValue = value.trim();

    if (!trimmedValue) {
      throw new BadRequestException('Empty filter value');
    }

    return trimmedValue;
  }

  private isProductType(value: string): value is ProductType {
    return (Object.values(ProductType) as string[]).includes(value);
  }
}
