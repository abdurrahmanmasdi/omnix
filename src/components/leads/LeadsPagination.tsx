'use client';

import { Button } from '@/components/ui/button';
import { Target, ChevronLeft, ChevronRight } from 'lucide-react';

interface LeadsPaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export function LeadsPagination({ page, totalPages, totalItems, onPageChange }: LeadsPaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);

  return (
    <div className="flex items-center justify-between px-10 py-6 border-t border-white/10 bg-[#051126] backdrop-blur-sm rounded-b-2xl">
      <div className="text-[10px] font-black text-brand-ice/40 uppercase tracking-[0.2em] flex items-center">
        <Target size={12} className="mr-2 text-brand-electric/50" />
        Syncing {totalItems} Active Records
      </div>
      <div className="flex items-center space-x-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="h-10 px-5 bg-[#051126] border-white/10 text-brand-ice/80 hover:bg-transparent/5 font-bold rounded-xl shadow-none transition-all active:scale-95 disabled:opacity-50"
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          PREV
        </Button>
        <div className="flex items-center space-x-1.5 bg-[#051126] p-1 rounded-xl border border-white/10 shadow-none">
          {[...Array(safeTotalPages)].map((_, i) => (
            <Button
              key={i}
              variant={page === i + 1 ? "default" : "ghost"}
              size="icon"
              className={`h-8 w-8 text-[11px] font-black transition-all rounded-lg ${page === i + 1 ? 'bg-brand-deep text-brand-cyan shadow-lg' : 'text-brand-ice/40 hover:text-brand-ice hover:bg-transparent/5'}`}
              onClick={() => onPageChange(i + 1)}
            >
              {i + 1}
            </Button>
          )).slice(Math.max(0, page - 3), Math.min(safeTotalPages, page + 2))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(safeTotalPages, page + 1))}
          disabled={page >= safeTotalPages}
          className="h-10 px-5 bg-[#051126] border-white/10 text-brand-ice/80 hover:bg-transparent/5 font-bold rounded-xl shadow-none transition-all active:scale-95 disabled:opacity-50"
        >
          NEXT
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
