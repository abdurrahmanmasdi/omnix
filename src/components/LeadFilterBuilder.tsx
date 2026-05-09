'use client';

import { useState, useMemo } from 'react';
import { FilterCondition, FilterOperator } from '@/lib/utils/ast-filter-builder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Plus, Trash2, Filter } from 'lucide-react';
import { CreateLeadDtoStatus } from '@/lib/api/model/createLeadDtoStatus';
import { CreateLeadDtoPriority } from '@/lib/api/model/createLeadDtoPriority';
import { useLeadSourcesControllerFindAll } from '@/lib/api/generated/lead-sources/lead-sources';

interface LeadFilterBuilderProps {
  onFiltersChange: (conditions: FilterCondition[]) => void;
  initialConditions?: FilterCondition[];
}

export function LeadFilterBuilder({ onFiltersChange, initialConditions = [] }: LeadFilterBuilderProps) {
  const [conditions, setConditions] = useState<FilterCondition[]>(initialConditions);

  // 1. Fetch sources for the filter dropdown
  const { data: sourcesData } = useLeadSourcesControllerFindAll();
  const sources = useMemo(() => {
    const data = sourcesData as any;
    if (Array.isArray(data)) return data;
    if (data?.items) return data.items;
    return [];
  }, [sourcesData]);

  const FIELDS = useMemo(() => [
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

  const OPERATORS: { label: string; value: FilterOperator }[] = [
    { label: 'Equals', value: 'equals' },
    { label: 'Contains', value: 'contains' },
    { label: 'Greater Than', value: 'greaterThan' },
    { label: 'Less Than', value: 'lessThan' },
    { label: 'Starts With', value: 'startsWith' },
    { label: 'Ends With', value: 'endsWith' },
  ];

  const addCondition = () => {
    const newCondition: FilterCondition = {
      field: 'status',
      operator: 'equals',
      value: CreateLeadDtoStatus.NEW,
    };
    setConditions([...conditions, newCondition]);
  };

  const removeCondition = (index: number) => {
    const updated = conditions.filter((_, i) => i !== index);
    setConditions(updated);
  };

  const updateCondition = (index: number, updates: Partial<FilterCondition>) => {
    const updated = conditions.map((c, i) => {
      if (i === index) {
        const newCondition = { ...c, ...updates };
        if (updates.field) {
          const fieldDef = FIELDS.find(f => f.value === updates.field);
          if (fieldDef?.type === 'select') {
            newCondition.value = fieldDef.options?.[0]?.value || 'none';
            newCondition.operator = 'equals';
          }
        }
        return newCondition;
      }
      return c;
    });
    setConditions(updated);
  };

  const applyFilters = () => {
    onFiltersChange(conditions);
  };

  const clearFilters = () => {
    setConditions([]);
    onFiltersChange([]);
  };

  return (
    <div className="flex flex-col h-full max-h-[500px]">
      <div className="p-5 border-b flex items-center justify-between bg-slate-50/80 backdrop-blur-sm">
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-blue-600" />
          <h4 className="font-bold text-xs uppercase tracking-widest text-slate-700">Filter Pipeline</h4>
        </div>
        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-[10px] font-black uppercase tracking-tighter text-slate-400 hover:text-slate-900">
          RESET ALL
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {conditions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center mb-3 border border-slate-100 shadow-inner">
              <Filter className="h-5 w-5 text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-900 uppercase tracking-tight">Precision Filtering</p>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-1">Add rules to slice your data</p>
          </div>
        ) : (
          conditions.map((condition, index) => {
            const currentField = FIELDS.find(f => f.value === condition.field);
            
            return (
              <div key={index} className="group flex items-center space-x-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <Select
                  value={condition.field}
                  onValueChange={(val) => updateCondition(index, { field: val })}
                >
                  <SelectTrigger className="w-[140px] h-10 text-[11px] font-bold rounded-xl border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {FIELDS.map((f) => (
                      <SelectItem key={f.value} value={f.value} className="text-[11px] font-bold">
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={condition.operator}
                  onValueChange={(val) => updateCondition(index, { operator: val as FilterOperator })}
                  disabled={currentField?.type === 'select'}
                >
                  <SelectTrigger className="w-[110px] h-10 text-[11px] font-black text-slate-400 rounded-xl border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {OPERATORS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-[11px] font-bold">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex-1 min-w-[120px]">
                  {currentField?.type === 'select' ? (
                    <Select
                      value={condition.value}
                      onValueChange={(val) => updateCondition(index, { value: val })}
                    >
                      <SelectTrigger className="w-full h-10 text-[11px] font-bold rounded-xl border-slate-200 bg-slate-50 border-none shadow-inner">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {currentField.options?.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-[11px] font-bold">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={currentField?.type === 'number' ? 'number' : 'text'}
                      placeholder="Enter criteria..."
                      className="h-10 text-[11px] font-bold rounded-xl border-slate-200 bg-slate-50 border-none shadow-inner"
                      value={condition.value}
                      onChange={(e) => updateCondition(index, { 
                        value: currentField?.type === 'number' ? Number(e.target.value) : e.target.value 
                      })}
                    />
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCondition(index)}
                  className="h-10 w-10 text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all rounded-xl"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })
        )}
      </div>

      <div className="p-5 border-t bg-slate-50 flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={addCondition} className="h-10 text-[10px] font-black uppercase tracking-widest border-slate-200 rounded-xl px-5">
          <Plus className="mr-2 h-4 w-4" />
          Add Rule
        </Button>
        <Button size="sm" onClick={applyFilters} className="h-10 text-[10px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-100 rounded-xl px-6">
          Execute Filter
        </Button>
      </div>
    </div>
  );
}
