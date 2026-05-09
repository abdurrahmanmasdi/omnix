'use client';

import { useState, useEffect, useMemo } from 'react';
import { useLeadsControllerFindAll, useLeadsControllerRemove } from '@/lib/api/generated/leads/leads';
import { useRouter } from 'next/navigation';
import { useLeadSourcesControllerFindAll } from '@/lib/api/generated/lead-sources/lead-sources';
import { buildSearchFilter, combineFilters, FilterCondition } from '@/lib/utils/ast-filter-builder';
import { LeadFilterBuilder } from '@/components/LeadFilterBuilder';
import { LeadDetailDrawer } from '@/components/LeadDetailDrawer';
import { LeadFormModal } from '@/components/LeadFormModal';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { 
  Search, 
  Filter as FilterIcon, 
  ChevronLeft, 
  ChevronRight, 
  MoreVertical,
  UserPlus,
  X,
  Edit,
  Trash2,
  ExternalLink,
  Phone,
  ArrowUpDown,
  Download,
  Copy,
  Loader2,
  Globe,
  Target,
  MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';
import { CreateLeadDtoStatus } from '@/lib/api/model/createLeadDtoStatus';
import { CreateLeadDtoPriority } from '@/lib/api/model/createLeadDtoPriority';

const STATUS_COLORS: Record<string, string> = {
  [CreateLeadDtoStatus.NEW]: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  [CreateLeadDtoStatus.QUALIFYING]: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  [CreateLeadDtoStatus.READY_TO_PAY]: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  [CreateLeadDtoStatus.HANDED_OFF]: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  [CreateLeadDtoStatus.UNQUALIFIED]: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
  [CreateLeadDtoStatus.WON]: 'bg-green-500/10 text-green-600 border-green-500/20',
  [CreateLeadDtoStatus.LOST]: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
};

const PRIORITY_COLORS: Record<string, string> = {
  [CreateLeadDtoPriority.HOT]: 'bg-red-500/10 text-red-600 border-red-500/20',
  [CreateLeadDtoPriority.WARM]: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  [CreateLeadDtoPriority.COLD]: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

export default function LeadsPage() {
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [advancedConditions, setAdvancedConditions] = useState<FilterCondition[]>([]);
  const [sortBy, setSortBy] = useState<{ field: string, direction: 'asc' | 'desc' }>({ field: 'createdAt', direction: 'desc' });
  const router = useRouter();
  
  // Modal/Drawer States
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [leadToEdit, setLeadToEdit] = useState<string | null>(null);

  // Handle debouncing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Build the AST filters
  const filters = useMemo(() => {
    return combineFilters(
      buildSearchFilter(debouncedSearch, ['firstName', 'lastName', 'phoneNumber', 'email', 'country']),
      ...advancedConditions
    );
  }, [debouncedSearch, advancedConditions]);

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

  const toggleSort = (field: string) => {
    setSortBy(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handleCopyPhone = (e: React.MouseEvent, phone: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    toast.success('Phone copied to clipboard');
  };

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center">
            LEADS COMMAND CENTER
            <Badge variant="outline" className="ml-3 bg-blue-600 text-white border-none px-2 py-0 h-5 text-[10px] font-black tracking-tighter">BETA</Badge>
          </h1>
          <p className="text-slate-500 font-medium mt-1">AI-Powered Patient Pipeline for High-End Medical Clinics.</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button className="bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-200 h-11 rounded-xl font-bold transition-all active:scale-95" onClick={() => { setLeadToEdit(null); setIsFormModalOpen(true); }}>
            <UserPlus className="mr-2 h-4 w-4" />
            New Onboarding
          </Button>
        </div>
      </div>

      <Card className="shadow-2xl shadow-slate-200/40 border-slate-100 overflow-hidden rounded-2xl bg-white/80 backdrop-blur-xl">
        <CardHeader className="border-b border-slate-100 py-5 px-8">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
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
                    onFiltersChange={(conditions) => {
                      setAdvancedConditions(conditions);
                      setPage(1);
                    }}
                    initialConditions={advancedConditions}
                  />
                </PopoverContent>
              </Popover>

              {advancedConditions.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setAdvancedConditions([])}
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
                <span>PAGE {page} OF {totalPages}</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-b border-slate-100">
                  <TableHead className="font-bold text-[11px] uppercase tracking-widest text-slate-500 h-14 px-8">
                    <button onClick={() => toggleSort('firstName')} className="flex items-center hover:text-blue-600 transition-colors">
                      Patient Profile <ArrowUpDown className="ml-2 h-3 w-3 opacity-50" />
                    </button>
                  </TableHead>
                  <TableHead className="font-bold text-[11px] uppercase tracking-widest text-slate-500 h-14">Attribution</TableHead>
                  <TableHead className="font-bold text-[11px] uppercase tracking-widest text-slate-500 h-14">
                    <button onClick={() => toggleSort('status')} className="flex items-center hover:text-blue-600 transition-colors">
                      Status <ArrowUpDown className="ml-2 h-3 w-3 opacity-50" />
                    </button>
                  </TableHead>
                  <TableHead className="font-bold text-[11px] uppercase tracking-widest text-slate-500 h-14">Priority</TableHead>
                  <TableHead className="font-bold text-[11px] uppercase tracking-widest text-slate-500 h-14 text-right">
                    <button onClick={() => toggleSort('estimatedValue')} className="flex items-center justify-end hover:text-blue-600 transition-colors ml-auto">
                      Pipeling Value <ArrowUpDown className="ml-2 h-3 w-3 opacity-50" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right font-bold text-[11px] uppercase tracking-widest text-slate-500 h-14 pr-8">Management</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-80 text-center">
                      <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="relative">
                          <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="h-6 w-6 rounded-full bg-blue-100"></div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-sm font-bold text-slate-900 uppercase tracking-widest">Decrypting Records...</span>
                          <p className="text-xs text-slate-400 font-medium italic">Fetching secure patient data from gRPC pipeline.</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : leads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-80 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="h-16 w-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-2 border border-slate-100 shadow-inner">
                          <X className="h-8 w-8 text-slate-200" />
                        </div>
                        <span className="text-sm font-bold text-slate-900 uppercase tracking-widest">Zero Results</span>
                        <p className="text-xs text-slate-400 max-w-xs mx-auto font-medium">No prospects found matching your current filter criteria or search parameters.</p>
                        <Button variant="outline" size="sm" onClick={() => { setSearch(''); setAdvancedConditions([]); }} className="mt-2 rounded-lg font-bold">Clear All filters</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  leads.map((lead: any) => {
                    const source = sources.find((s: any) => s.id === lead.sourceId);
                    return (
                      <TableRow 
                        key={lead.id} 
                        className="group hover:bg-slate-50/80 transition-all cursor-pointer border-l-4 border-l-transparent hover:border-l-blue-600"
                        onClick={() => setSelectedLeadId(lead.id)}
                      >
                        <TableCell className="px-8">
                          <div className="flex items-center space-x-4">
                            <div className={`h-11 w-11 rounded-2xl flex items-center justify-center text-[10px] font-black border-2 border-white shadow-lg shadow-slate-200/50 ${STATUS_COLORS[lead.status]?.split(' ')[0]}`}>
                              {lead.firstName?.charAt(0)}{lead.lastName?.charAt(0)}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors text-sm">{lead.firstName} {lead.lastName}</div>
                              <div className="flex items-center space-x-2 mt-1">
                                <div className="text-[10px] text-slate-400 font-bold bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 tracking-tighter">#{lead.id.substring(0,8)}</div>
                                <div className="flex items-center text-[10px] text-slate-500 font-medium italic">
                                  <Globe className="h-2.5 w-2.5 mr-1 text-slate-300" />
                                  {lead.country}
                                </div>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1.5">
                            <div className="flex items-center text-[11px] font-bold text-slate-600">
                              <Target className="h-3 w-3 mr-1.5 text-blue-500/50" />
                              {source?.name || 'Direct / Referral'}
                            </div>
                            <div className="flex items-center text-[10px] text-slate-400 font-medium group/phone" onClick={(e) => handleCopyPhone(e, lead.phoneNumber)}>
                              <Phone className="h-2.5 w-2.5 mr-1.5" />
                              {lead.phoneNumber}
                              <Copy className="h-2.5 w-2.5 ml-2 opacity-0 group-hover/phone:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`${STATUS_COLORS[lead.status]} px-3 py-1 border shadow-sm text-[10px] font-bold rounded-lg tracking-tight`}>
                            {lead.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`${PRIORITY_COLORS[lead.priority]} px-3 py-1 border shadow-sm text-[10px] font-bold rounded-lg tracking-tight`}>
                            {lead.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="font-black text-slate-900 text-sm">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: lead.currency || 'USD', maximumFractionDigits: 0 }).format(lead.estimatedValue || 0)}
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold tracking-widest mt-0.5">EST. POTENTIAL</div>
                        </TableCell>
                        <TableCell className="text-right pr-8" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end space-x-2">
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" onClick={() => handleEdit(lead.id)}>
                              <Edit className="h-4.5 w-4.5" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all">
                                  <MoreVertical className="h-4.5 w-4.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56 shadow-2xl border-slate-100 rounded-xl p-2 animate-in slide-in-from-top-1 duration-200">
                                <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-3 py-2">Operations</DropdownMenuLabel>
                                <DropdownMenuItem className="rounded-lg font-bold text-slate-700 py-2.5 cursor-pointer" onClick={() => setSelectedLeadId(lead.id)}>
                                  <ExternalLink className="mr-3 h-4 w-4 text-blue-500" /> View Detailed Profile
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="rounded-lg font-bold text-slate-700 py-2.5 cursor-pointer"
                                  onClick={() => {
                                    if (lead.conversationId) {
                                      router.push(`/dashboard/conversations/${lead.conversationId}`);
                                    } else {
                                      toast.error('No conversation linked to this patient yet.');
                                    }
                                  }}
                                >
                                  <MessageSquare className="mr-3 h-4 w-4 text-emerald-500" /> Open Conversation
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="my-2 bg-slate-100" />
                                <DropdownMenuItem className="rounded-lg font-bold text-red-600 focus:text-red-600 focus:bg-red-50 py-2.5 cursor-pointer" onClick={() => handleDelete(lead.id)}>
                                  <Trash2 className="mr-3 h-4 w-4" /> Erase High-Value Record
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between px-10 py-6 border-t border-slate-100 bg-slate-50/50 backdrop-blur-sm">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center">
              <Target size={12} className="mr-2 text-slate-300" />
              Syncing {leads.length} Active Records
            </div>
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-10 px-5 bg-white border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                PREV
              </Button>
              <div className="flex items-center space-x-1.5 bg-white p-1 rounded-xl border border-slate-100 shadow-sm">
                {[...Array(totalPages)].map((_, i) => (
                  <Button
                    key={i}
                    variant={page === i + 1 ? "default" : "ghost"}
                    size="icon"
                    className={`h-8 w-8 text-[11px] font-black transition-all rounded-lg ${page === i + 1 ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-900'}`}
                    onClick={() => setPage(i + 1)}
                  >
                    {i + 1}
                  </Button>
                )).slice(Math.max(0, page - 3), Math.min(totalPages, page + 2))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-10 px-5 bg-white border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50"
              >
                NEXT
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
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
