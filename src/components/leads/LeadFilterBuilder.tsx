'use client';

import { useMemo } from 'react';
import { FilterCondition } from '@/lib/utils/ast-filter-builder';
import { FilterBuilder, FilterFieldDef } from '@/components/ui/filter-builder/FilterBuilder';
import { CreateLeadDtoPriority } from '@/lib/api/model/createLeadDtoPriority';
import { useLeadSourcesControllerFindAll } from '@/lib/api/generated/lead-sources/lead-sources';
import { usePipelineStagesControllerFindAll } from '@/lib/api/generated/pipeline-stages/pipeline-stages';

interface SourceItem {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface StageItem {
  name: string;
  orderIndex: number;
  [key: string]: unknown;
}

interface LeadFilterBuilderProps {
  onFiltersChange: (conditions: FilterCondition[]) => void;
  initialConditions?: FilterCondition[];
}

export function LeadFilterBuilder({ onFiltersChange, initialConditions = [] }: LeadFilterBuilderProps) {
  // Fetch sources for the filter dropdown
  const { data: sourcesData } = useLeadSourcesControllerFindAll();
  const sources = useMemo(() => {
    const data = sourcesData as unknown;
    if (Array.isArray(data)) return data as SourceItem[];
    if (data && typeof data === 'object' && 'items' in data) return (data as { items: SourceItem[] }).items;
    return [] as SourceItem[];
  }, [sourcesData]);

  // Fetch pipeline stages dynamically
  const { data: stagesData } = usePipelineStagesControllerFindAll();
  const stages = useMemo(() => {
    const data = stagesData as unknown;
    const arr = Array.isArray(data) 
      ? data 
      : (data && typeof data === 'object' && 'items' in data 
          ? (data as { items: StageItem[] }).items 
          : (data && typeof data === 'object' && 'data' in data 
              ? (data as { data: StageItem[] }).data 
              : []));
    return [...(arr as StageItem[])].sort((a, b) => a.orderIndex - b.orderIndex);
  }, [stagesData]);

  const fields: FilterFieldDef[] = useMemo(() => [
    { label: 'First Name', value: 'firstName', type: 'text' },
    { label: 'Last Name', value: 'lastName', type: 'text' },
    { 
      label: 'Status', 
      value: 'status', 
      type: 'select', 
      options: stages.map((s) => ({ label: s.name, value: s.name }))
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
      options: sources.map((s) => ({ label: s.name, value: s.id }))
    },
    { label: 'Estimated Value', value: 'estimatedValue', type: 'number' },
    { label: 'Country', value: 'country', type: 'text' },
  ], [sources, stages]);

  return (
    <FilterBuilder 
      fields={fields}
      initialConditions={initialConditions}
      onFiltersChange={onFiltersChange}
      title="Filter Patient Pipeline"
    />
  );
}
