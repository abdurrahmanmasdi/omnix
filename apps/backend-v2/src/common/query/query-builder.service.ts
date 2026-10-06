import { BadRequestException, Injectable } from '@nestjs/common';
import {
  FilterNode,
  isFilterCondition,
  isFilterGroup,
} from './interfaces/filter.interface';
import { SortNode } from './interfaces/sort.interface';

export interface QueryBuilderConfig {
  allowedFilterFields: string[];
  allowedSortFields: string[];
  uuidFields?: string[];
  dateFields?: string[];
  numberFields?: string[];
  booleanFields?: string[];
}

@Injectable()
export class QueryBuilderService {
  public buildWhere(
    filtersRaw: string | undefined,
    config: QueryBuilderConfig,
  ): any {
    if (!filtersRaw) return {};

    let parsed: unknown;
    try {
      parsed = JSON.parse(filtersRaw);
    } catch {
      throw new BadRequestException(
        'Invalid filters format. Must be a valid JSON string.',
      );
    }

    // Handle top-level array of conditions
    if (Array.isArray(parsed)) {
      const equalsGroups: Record<string, any[]> = {};
      const otherConditions: any[] = [];

      for (const cond of parsed) {
        // Explicit Type Guard to satisfy TypeScript
        if (isFilterCondition(cond)) {
          if (cond.operator === 'equals') {
            if (!equalsGroups[cond.field]) equalsGroups[cond.field] = [];
            equalsGroups[cond.field].push(cond.value);
          } else {
            otherConditions.push(cond);
          }
        } else {
          // If it's a nested group inside an array
          otherConditions.push(cond);
        }
      }

      const mergedEqualsConditions = Object.entries(equalsGroups).map(
        ([field, values]) => {
          if (values.length === 1)
            return { field, operator: 'equals', value: values[0] };
          return { field, operator: 'in', value: values };
        },
      );

      parsed = {
        logicalOperator: 'AND',
        conditions: [...otherConditions, ...mergedEqualsConditions],
      };
    }

    // Cast parsed to FilterNode now that we have transformed it
    const where = this.traverseFilterNode(parsed as FilterNode, config);
    return where ? { AND: [where] } : {};
  }

  private traverseFilterNode(
    node: FilterNode,
    config: QueryBuilderConfig,
  ): any | null {
    if (!node) return null;

    // Handle the case where node is a direct array (FilterNode[])
    if (Array.isArray(node)) {
      const conditions = node
        .map((cond) => this.traverseFilterNode(cond, config))
        .filter((cond) => cond !== null);

      return conditions.length > 0 ? { AND: conditions } : null;
    }

    if (isFilterGroup(node)) {
      if (!['AND', 'OR', 'NOT'].includes(node.logicalOperator)) {
        throw new BadRequestException(
          `Invalid logical operator: ${node.logicalOperator}`,
        );
      }

      const conditions = node.conditions
        .map((cond) => this.traverseFilterNode(cond, config))
        .filter((cond) => cond !== null);

      if (conditions.length === 0) return null;

      if (node.logicalOperator === 'NOT') {
        return { NOT: conditions.length === 1 ? conditions[0] : conditions };
      }

      return { [node.logicalOperator]: conditions };
    }

    if (isFilterCondition(node)) {
      if (!config.allowedFilterFields.includes(node.field)) {
        throw new BadRequestException(
          `Filter field is not allowed: ${node.field}`,
        );
      }

      const value = this.normalizeValue(node.field, node.value, config);
      return this.buildPrismaCondition(node.field, node.operator, value);
    }

    return null;
  }

  private buildPrismaCondition(
    field: string,
    operator: string,
    value: any,
  ): any {
    const segments = field.split('.'); // Handle relations like "assignedAgent.firstName"
    const condition = this.mapOperatorToPrisma(operator, value);
    return this.nestRelations(segments, condition);
  }

  private mapOperatorToPrisma(operator: string, value: any): any {
    switch (operator) {
      case 'equals':
        return value;
      case 'not_equals':
        return { not: value };
      case 'greater_than':
        return { gt: value };
      case 'greater_than_equals':
        return { gte: value };
      case 'less_than':
        return { lt: value };
      case 'less_than_equals':
        return { lte: value };
      case 'contains':
        return { contains: String(value), mode: 'insensitive' };
      case 'starts_with':
        return { startsWith: String(value), mode: 'insensitive' };
      case 'ends_with':
        return { endsWith: String(value), mode: 'insensitive' };
      case 'is_empty':
        return { equals: null };
      case 'is_not_empty':
        return { not: null };
      case 'in':
        return { in: Array.isArray(value) ? value : [value] };
      case 'not_in':
        return { notIn: Array.isArray(value) ? value : [value] };
      default:
        throw new BadRequestException(`Invalid operator: ${operator}`);
    }
  }

  private nestRelations(segments: string[], condition: any): any {
    let result = condition;
    for (let i = segments.length - 1; i >= 0; i--) {
      result = { [segments[i]]: result };
    }
    return result;
  }

  private normalizeValue(
    field: string,
    value: any,
    config: QueryBuilderConfig,
  ): any {
    if (Array.isArray(value)) {
      return value.map((v) => this.normalizeSingleValue(field, v, config));
    }
    return this.normalizeSingleValue(field, value, config);
  }

  private normalizeSingleValue(
    field: string,
    value: any,
    config: QueryBuilderConfig,
  ): any {
    if (value === null) return null;

    if (config.uuidFields?.includes(field)) {
      if (!this.isUuid(value))
        throw new BadRequestException(
          `Invalid UUID format for field: ${field}`,
        );
      return value;
    }

    if (config.dateFields?.includes(field)) {
      const date = new Date(value);
      if (isNaN(date.getTime()))
        throw new BadRequestException(
          `Invalid date format for field: ${field}`,
        );
      return date;
    }

    if (config.numberFields?.includes(field)) {
      const num = Number(value);
      if (isNaN(num))
        throw new BadRequestException(
          `Invalid number format for field: ${field}`,
        );
      return num;
    }

    if (config.booleanFields?.includes(field)) {
      if (value === 'true' || value === true) return true;
      if (value === 'false' || value === false) return false;
      throw new BadRequestException(
        `Invalid boolean format for field: ${field}`,
      );
    }

    return typeof value === 'string' ? value.trim() : value;
  }

  private isUuid(value: any): boolean {
    if (typeof value !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  public buildOrderBy(
    sortsRaw: string | undefined,
    config: QueryBuilderConfig,
  ): any[] {
    if (!sortsRaw) {
      if (config.allowedSortFields.includes('createdAt')) {
        return [{ createdAt: 'desc' }];
      }
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(sortsRaw);
    } catch {
      throw new BadRequestException(
        'Invalid sorts format. Must be a valid JSON array.',
      );
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException('Sorts must be an array of objects.');
    }

    const orderBy: any[] = [];

    // Explicitly iterate over any[] to satisfy TS, and check property existence safely
    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        'field' in item &&
        'direction' in item
      ) {
        const { field, direction } = item as SortNode;
        if (
          config.allowedSortFields.includes(field) &&
          ['asc', 'desc'].includes(direction)
        ) {
          const nested = this.nestRelations(field.split('.'), direction);
          orderBy.push(nested);
        }
      }
    }

    return orderBy.length > 0
      ? orderBy
      : config.allowedSortFields.includes('createdAt')
        ? [{ createdAt: 'desc' }]
        : [];
  }
}
