'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useLeadsControllerFindAll, useLeadsControllerRemove } from '@/lib/api/generated/leads/leads';
import { useLeadSourcesControllerFindAll } from '@/lib/api/generated/lead-sources/lead-sources';
import { buildSearchFilter, combineFilters, FilterCondition } from '@/lib/utils/ast-filter-builder';
import { LeadDetailDrawer } from './LeadDetailDrawer';
import { LeadFormModal } from './LeadFormModal';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { toast } from 'sonner';

import { LeadsHeader } from './LeadsHeader';
import { LeadsToolbar } from './LeadsToolbar';
import { LeadsTable } from './LeadsTable';
import { LeadsPagination } from './LeadsPagination';

export function LeadsDashboardClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL State
  const page = Number(searchParams.get('page')) || 1;
  const limit = 10;
  const search = searchParams.get('search') || '';
  const filtersParam = searchParams.get('filters');
  
  // Local state for complex object (easier than full serialization for now, but could be pushed to URL)
  // For 'advancedConditions', to keep URLs clean we could stringify/parse, or keep it local to avoid giant URLs.
  // The user requested URL state, so let's try to sync it if possible, but AST JSON can be huge.
  // Let's keep advancedConditions in local state for now, but search, page, and sort in URL.
  const [advancedConditions, setAdvancedConditions] = useState<FilterCondition[]>(
    filtersParam ? JSON.parse(filtersParam) : []
  );
  const [sortBy, setSortBy] = useState<{ field: string, direction: 'asc' | 'desc' }>(
    searchParams.get('sortField') 
      ? { field: searchParams.get('sortField') as string, direction: (searchParams.get('sortDir') as 'asc' | 'desc') || 'desc' } 
      : { field: 'createdAt', direction: 'desc' }
  );

  // Modal/Drawer States
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [leadToEdit, setLeadToEdit] = useState<string | null>(null);

  // Sync state to URL
  const updateUrl = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, pathname, router]);

  const handleSearchChange = (newSearch: string) => {
    updateUrl({ search: newSearch, page: '1' });
  };

  const handleFiltersChange = (conditions: FilterCondition[]) => {
    setAdvancedConditions(conditions);
    updateUrl({ 
      filters: conditions.length > 0 ? JSON.stringify(conditions) : null,
      page: '1' 
    });
  };

  const handlePageChange = (newPage: number) => {
    updateUrl({ page: newPage.toString() });
  };

  const handleSortChange = (field: string) => {
    const newDir = sortBy.field === field && sortBy.direction === 'desc' ? 'asc' : 'desc';
    setSortBy({ field, direction: newDir });
    updateUrl({ sortField: field, sortDir: newDir, page: '1' });
  };

  // Build the AST filters
  const filters = useMemo(() => {
    return combineFilters(
      buildSearchFilter(search, ['firstName', 'lastName', 'phoneNumber', 'email', 'country']),
      ...advancedConditions
    );
  }, [search, advancedConditions]);

  // 1. Fetch leads
  const { data, isLoading, refetch } = useLeadsControllerFindAll({
    page,
    limit,
    filters: filters ? JSON.stringify(filters) : undefined,
    sorts: JSON.stringify([sortBy]),
  });

  // 2. Fetch sources for grid display
  const { data: sourcesData } = useLeadSourcesControllerFindAll();
  const sources = useMemo(() => {
    const d = sourcesData as any;
    if (Array.isArray(d)) return d;
    if (d?.items) return d.items;
    return [];
  }, [sourcesData]);

  const deleteMutation = useLeadsControllerRemove();

  const paginatedLeads = data as any;
  const leads = useMemo(() => {
    if (Array.isArray(paginatedLeads)) return paginatedLeads;
    if (paginatedLeads?.items) return paginatedLeads.items;
    if (paginatedLeads?.data) return paginatedLeads.data;
    return [];
  }, [paginatedLeads]);

  const totalLeads = paginatedLeads?.total || paginatedLeads?.meta?.totalItems || leads.length;
  const totalPages = paginatedLeads?.totalPages || paginatedLeads?.meta?.totalPages || 1;

  const handleEdit = (id: string) => {
    setLeadToEdit(id);
    setIsFormModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this high-priority record?')) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast.success('Patient record deleted');
          refetch();
        },
        onError: () => toast.error('Encryption policy prevents deletion or server error.')
      });
    }
  };

  const handleOpenConversation = (conversationId?: string) => {
    if (conversationId) {
      router.push(`/dashboard/conversations/${conversationId}`);
    } else {
      toast.error('No conversation linked to this patient yet.');
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <LeadsHeader onNewOnboarding={() => { setLeadToEdit(null); setIsFormModalOpen(true); }} />

      <Card className="shadow-2xl shadow-slate-200/40 border-slate-100 overflow-hidden rounded-2xl bg-white/80 backdrop-blur-xl">
        <LeadsToolbar 
          onSearchChange={handleSearchChange}
          onFiltersChange={handleFiltersChange}
          initialSearch={search}
          initialFilters={advancedConditions}
          totalLeads={totalLeads}
          page={page}
          totalPages={totalPages}
        />
        
        <CardContent className="p-0">
          <LeadsTable 
            leads={leads}
            sources={sources}
            isLoading={isLoading}
            sortBy={sortBy}
            onSortChange={handleSortChange}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onViewProfile={setSelectedLeadId}
            onOpenConversation={handleOpenConversation}
            onClearFilters={() => handleFiltersChange([])}
          />

          <LeadsPagination 
            page={page}
            totalPages={totalPages}
            totalItems={totalLeads}
            onPageChange={handlePageChange}
          />
        </CardContent>
      </Card>

      <LeadDetailDrawer 
        leadId={selectedLeadId} 
        onClose={() => setSelectedLeadId(null)} 
        onUpdate={refetch}
        onEdit={handleEdit}
      />

      <LeadFormModal 
        isOpen={isFormModalOpen}
        leadId={leadToEdit}
        onClose={() => { setIsFormModalOpen(false); setLeadToEdit(null); }}
        onSuccess={refetch}
      />
    </div>
  );
}
