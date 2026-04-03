export type LogicalOperator = 'AND' | 'OR' | 'NOT';
export type FilterOperator =
  | 'equals'
  | 'not'
  | 'in'
  | 'notIn'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'contains'
  | 'startsWith'
  | 'endsWith';

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: any;
}

export interface FilterGroup {
  logicalOperator: LogicalOperator;
  conditions: FilterNode[];
}

export type FilterNode = FilterCondition | FilterGroup;

export function isFilterGroup(node: FilterNode): node is FilterGroup {
  return (
    (node as FilterGroup).logicalOperator !== undefined &&
    Array.isArray((node as FilterGroup).conditions)
  );
}

export function isFilterCondition(node: FilterNode): node is FilterCondition {
  return (
    (node as FilterCondition).field !== undefined &&
    (node as FilterCondition).operator !== undefined &&
    (node as FilterCondition).value !== undefined
  );
}
