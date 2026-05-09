export type LogicalOperator = 'AND' | 'OR';

export type FilterOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'in'
  | 'notIn'
  | 'isNull'
  | 'isNotNull';

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: any;
}

export interface FilterGroup {
  logicalOperator: LogicalOperator;
  conditions: (FilterCondition | FilterGroup)[];
}

export interface SortNode {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Helper to build a simple AND filter group from a search term across multiple fields
 */
export const buildSearchFilter = (
  searchTerm: string,
  fields: string[]
): FilterGroup | undefined => {
  if (!searchTerm.trim()) return undefined;

  return {
    logicalOperator: 'OR',
    conditions: fields.map((field) => ({
      field,
      operator: 'contains',
      value: searchTerm.trim(),
    })),
  };
};

/**
 * Combines multiple filter groups/conditions with an AND operator
 */
export const combineFilters = (
  ...filters: (FilterCondition | FilterGroup | undefined)[]
): FilterGroup | undefined => {
  const activeFilters = filters.filter((f): f is FilterCondition | FilterGroup => !!f);

  if (activeFilters.length === 0) return undefined;
  if (activeFilters.length === 1 && 'logicalOperator' in activeFilters[0]) {
    return activeFilters[0] as FilterGroup;
  }

  return {
    logicalOperator: 'AND',
    conditions: activeFilters,
  };
};
