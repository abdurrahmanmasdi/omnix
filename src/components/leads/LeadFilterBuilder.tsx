'use client';

import { useMemo } from 'react';
import { FilterCondition } from '@/lib/utils/ast-filter-builder';
import { FilterBuilder, FilterFieldDef } from '@/components/ui/filter-builder/FilterBuilder';
import { CreateLeadDtoStatus } from '@/lib/api/model/createLeadDtoStatus';
import { CreateLeadDtoPriority } from '@/lib/api/model/createLeadDtoPriority';
import { useLeadSourcesControllerFindAll } from '@/lib/api/generated/lead-sources/lead-sources';

interface LeadFilterBuilderProps {
  onFiltersChange: (conditions: FilterCondition[]) => void;
  initialConditions?: FilterCondition[];
}

export function LeadFilterBuilder({ onFiltersChange, initialConditions = [] }: LeadFilterBuilderProps) {
  // Fetch sources for the filter dropdown
  const { data: sourcesData } = useLeadSourcesControllerFindAll();
  const sources = useMemo(() => {
    const data = sourcesData as any;
    if (Array.isArray(data)) return data;
    if (data?.items) return data.items;
    return [];
  }, [sourcesData]);

  const fields: FilterFieldDef[] = useMemo(() => [
    { label: 'First Name', value: 'firstName', type: 'text' },
    { label: 'Last Name', value: 'lastName', type: 'text' },
    { 
      label: 'Status', 
      value: 'status', 
      type: 'select', 
      options: Object.values(CreateLeadDtoStatus).map(s => ({ label: s, value: s }))
    },
    { 
      label: 'Priority', 
      value: 'priority', 
      type: 'select', 
      options: Object.values(CreateLeadDtoPriority).map(p => ({ label: p, value: p }))
    },
    { 
      label: 'Marketing Source', 
      value: 'sourceId', 
      type: 'select', 
      options: sources.map((s: any) => ({ label: s.name, value: s.id }))
    },
    { label: 'Estimated Value', value: 'estimatedValue', type: 'number' },
    { label: 'Country', value: 'country', type: 'text' },
  ], [sources]);

  return (
    <FilterBuilder 
      fields={fields}
      initialConditions={initialConditions}
      onFiltersChange={onFiltersChange}
      title="Filter Patient Pipeline"
    />
  );
}
