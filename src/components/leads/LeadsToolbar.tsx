'use client';

import { useState, useEffect } from 'react';
import { FilterCondition } from '@/lib/utils/ast-filter-builder';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { LeadFilterBuilder } from '@/components/leads/LeadFilterBuilder';
import { Search, Filter as FilterIcon, X, Target } from 'lucide-react';

interface LeadsToolbarProps {
  onSearchChange: (search: string) => void;
  onFiltersChange: (conditions: FilterCondition[]) => void;
  initialSearch?: string;
  initialFilters?: FilterCondition[];
  totalLeads: number;
  page: number;
  totalPages: number;
}

export function LeadsToolbar({
  onSearchChange,
  onFiltersChange,
  initialSearch = '',
  initialFilters = [],
  totalLeads,
  page,
  totalPages,
}: LeadsToolbarProps) {
  const [search, setSearch] = useState(initialSearch);
  const [advancedConditions, setAdvancedConditions] = useState<FilterCondition[]>(initialFilters);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search, onSearchChange]);

  const handleClearFilters = () => {
    setAdvancedConditions([]);
    onFiltersChange([]);
  };

  const handleApplyFilters = (conditions: FilterCondition[]) => {
    setAdvancedConditions(conditions);
    onFiltersChange(conditions);
  };

  return (
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 px-8 py-5 border-b border-slate-100 bg-white/80 backdrop-blur-xl rounded-t-2xl">
      <div className="flex flex-1 items-center space-x-3 max-w-4xl">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search identity, phone or region..."
            className="pl-11 h-12 bg-slate-50 border-none focus:ring-2 focus:ring-blue-500/10 transition-all font-medium rounded-xl"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-12 bg-white border-slate-200 hover:bg-slate-50 transition-colors px-5 rounded-xl font-bold text-slate-700 shadow-sm">
              <FilterIcon className="mr-2 h-4 w-4 text-blue-500" />
              Advanced Rules
              {advancedConditions.length > 0 && (
                <Badge className="ml-2 bg-blue-600 text-white border-none px-1.5 h-5 min-w-5 justify-center">
                  {advancedConditions.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[500px] p-0 shadow-2xl border-slate-200 rounded-2xl overflow-hidden" align="start">
            <LeadFilterBuilder 
              onFiltersChange={handleApplyFilters}
              initialConditions={advancedConditions}
            />
          </PopoverContent>
        </Popover>

        {advancedConditions.length > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleClearFilters}
            className="text-slate-400 hover:text-slate-900 h-12 px-4 font-bold"
          >
            <X className="mr-2 h-4 w-4" />
            RESET
          </Button>
        )}
      </div>
      
      <div className="flex items-center space-x-6 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 px-6 py-3 rounded-xl border border-slate-100 shadow-inner">
        <div className="flex items-center">
          <div className="h-2 w-2 rounded-full bg-emerald-500 mr-2 shadow-sm shadow-emerald-200"></div>
          {totalLeads} HIGH-INTEGRITY RECORDS
        </div>
        <div className="flex items-center space-x-2">
          <Target size={12} className="text-blue-500" />
          <span>PAGE {page} OF {Math.max(1, totalPages)}</span>
        </div>
      </div>
    </div>
  );
}
