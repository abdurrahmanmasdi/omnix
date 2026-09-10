'use client';

import { useState, useEffect, useRef } from 'react';
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

  // Use a ref for the callback so the debounce effect only depends on `search`
  const onSearchChangeRef = useRef(onSearchChange);
  onSearchChangeRef.current = onSearchChange;

  // Track whether this is the first render to skip the initial fire
  const isFirstRender = useRef(true);

  // Debounce search — only fires when `search` actually changes (not on mount)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      onSearchChangeRef.current(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const handleClearFilters = () => {
    setAdvancedConditions([]);
    onFiltersChange([]);
  };

  const handleApplyFilters = (conditions: FilterCondition[]) => {
    setAdvancedConditions(conditions);
    onFiltersChange(conditions);
  };

  return (
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 px-8 py-5 border-b border-white/5 bg-brand-navy/50 backdrop-blur-xl rounded-t-2xl">
      <div className="flex flex-1 items-center space-x-3 max-w-4xl">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-ice/40" />
          <Input
            placeholder="Search identity, phone or region..."
            className="pl-11 h-12 bg-[#051126] border border-white/10 focus:ring-2 focus:ring-brand-electric/50 text-white placeholder:text-brand-ice/40 transition-all font-medium rounded-xl"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-12 bg-[#051126] border-white/10 hover:bg-brand-electric/10 transition-colors px-5 rounded-xl font-bold text-brand-ice/80 shadow-none">
              <FilterIcon className="mr-2 h-4 w-4 text-brand-electric" />
              Advanced Rules
              {advancedConditions.length > 0 && (
                <Badge className="ml-2 bg-brand-deep text-brand-cyan border-none px-1.5 h-5 min-w-5 justify-center">
                  {advancedConditions.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[500px] p-0 shadow-2xl border-white/10 bg-[#051126] text-brand-ice rounded-2xl overflow-hidden" align="start">
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
            className="text-brand-ice/40 hover:text-brand-ice h-12 px-4 font-bold"
          >
            <X className="mr-2 h-4 w-4" />
            RESET
          </Button>
        )}
      </div>
      
      <div className="flex items-center space-x-6 text-[10px] font-black uppercase tracking-widest text-brand-ice/60 bg-brand-deep/10 px-6 py-3 rounded-xl border border-brand-electric/20 shadow-inner">
        <div className="flex items-center">
          <div className="h-2 w-2 rounded-full bg-emerald-500 mr-2 shadow-none shadow-emerald-500/20"></div>
          {totalLeads} HIGH-INTEGRITY RECORDS
        </div>
        <div className="flex items-center space-x-2">
          <Target size={12} className="text-brand-electric" />
          <span>PAGE {page} OF {Math.max(1, totalPages)}</span>
        </div>
      </div>
    </div>
  );
}
