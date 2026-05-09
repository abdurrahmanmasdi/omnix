export interface FilterCondition {
  field: string;
  operator: string;
  value: any;
}

export interface FilterGroup {
  logicalOperator: 'AND' | 'OR' | 'NOT';
  conditions: FilterNode[];
}

export type FilterNode = FilterCondition | FilterGroup | FilterNode[];

export function isFilterGroup(node: any): node is FilterGroup {
  return (
    node &&
    typeof node.logicalOperator === 'string' &&
    Array.isArray(node.conditions)
  );
}

export function isFilterCondition(node: any): node is FilterCondition {
  return (
    node && typeof node.field === 'string' && typeof node.operator === 'string'
  );
}
