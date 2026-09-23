'use client';
import type { LeadResponseDto, CreateLeadSourceDto } from '@/lib/api/model';


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
import { 
  ArrowUpDown, 
  Loader2, 
  X, 
  Globe, 
  Target, 
  Phone, 
  Copy, 
  Edit, 
  MoreVertical, 
  ExternalLink, 
  MessageSquare, 
  Trash2 
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_PALETTE = [
  'bg-blue-500/10 text-blue-600 border-blue-500/20',
  'bg-purple-500/10 text-purple-600 border-purple-500/20',
  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'bg-orange-500/10 text-orange-600 border-orange-500/20',
  'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  'bg-green-500/10 text-green-600 border-green-500/20',
  'bg-rose-500/100/10 text-rose-600 border-rose-500/20',
  'bg-amber-500/200/10 text-amber-400 border-amber-500/20',
  'bg-brand-electric/100/10 text-indigo-600 border-indigo-500/20',
];

function getStatusColor(status: string): string {
  // Simple hash to pick a consistent color for any stage name
  let hash = 0;
  for (let i = 0; i < status.length; i++) {
    hash = status.charCodeAt(i) + ((hash << 5) - hash);
  }
  return STATUS_PALETTE[Math.abs(hash) % STATUS_PALETTE.length];
}

const PRIORITY_COLORS: Record<string, string> = {
  HOT: 'bg-red-500/10 text-red-400 border-red-500/20',
  WARM: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  COLD: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  country: string;
  phoneNumber: string;
  status: string;
  priority: string;
  estimatedValue: number;
  currency?: string;
  sourceId?: string;
  conversation?: { id: string };
  [key: string]: unknown;
}


interface LeadsTableProps {
  leads: LeadResponseDto[];
  sources: (CreateLeadSourceDto & { id: string })[];
  isLoading: boolean;
  sortBy: { field: string; direction: 'asc' | 'desc' };
  onSortChange: (field: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onViewProfile: (id: string) => void;
  onOpenConversation: (conversationId?: string) => void;
  onClearFilters: () => void;
}

export function LeadsTable({
  leads,
  sources,
  isLoading,
  onSortChange,
  onEdit,
  onDelete,
  onViewProfile,
  onOpenConversation,
  onClearFilters
}: LeadsTableProps) {
  
  const handleCopyPhone = (e: React.MouseEvent, phone: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    toast.success('Phone copied to clipboard');
  };

  const toggleSort = (field: string) => {
    onSortChange(field);
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-transparent/5 hover:bg-transparent/10 border-b border-white/10">
            <TableHead className="font-bold text-[11px] uppercase tracking-widest text-brand-ice/60 h-14 px-8">
              <button onClick={() => toggleSort('firstName')} className="flex items-center hover:text-brand-electric transition-colors">
                Patient Profile <ArrowUpDown className="ml-2 h-3 w-3 opacity-50" />
              </button>
            </TableHead>
            <TableHead className="font-bold text-[11px] uppercase tracking-widest text-brand-ice/60 h-14">Attribution</TableHead>
            <TableHead className="font-bold text-[11px] uppercase tracking-widest text-brand-ice/60 h-14">
              <button onClick={() => toggleSort('status')} className="flex items-center hover:text-brand-electric transition-colors">
                Status <ArrowUpDown className="ml-2 h-3 w-3 opacity-50" />
              </button>
            </TableHead>
            <TableHead className="font-bold text-[11px] uppercase tracking-widest text-brand-ice/60 h-14">Priority</TableHead>
            <TableHead className="font-bold text-[11px] uppercase tracking-widest text-brand-ice/60 h-14 text-right">
              <button onClick={() => toggleSort('estimatedValue')} className="flex items-center justify-end hover:text-brand-electric transition-colors ml-auto">
                Pipeline Value <ArrowUpDown className="ml-2 h-3 w-3 opacity-50" />
              </button>
            </TableHead>
            <TableHead className="text-right font-bold text-[11px] uppercase tracking-widest text-brand-ice/60 h-14 pr-8">Management</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={6} className="h-80 text-center">
                <div className="flex flex-col items-center justify-center space-y-4">
                  <div className="relative">
                    <Loader2 className="h-12 w-12 animate-spin text-brand-glow" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="h-6 w-6 rounded-full bg-brand-deep"></div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-sm font-bold text-brand-ice uppercase tracking-widest">Decrypting Records...</span>
                    <p className="text-xs text-brand-ice/60 font-medium italic">Fetching secure patient data from gRPC pipeline.</p>
                  </div>
                </div>
              </TableCell>
            </TableRow>
          ) : leads.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-80 text-center">
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="h-16 w-16 rounded-2xl bg-brand-deep/30 flex items-center justify-center mb-2 border border-brand-electric/20 shadow-inner">
                    <X className="h-8 w-8 text-brand-glow animate-pulse" />
                  </div>
                  <span className="text-sm font-bold text-brand-ice uppercase tracking-widest">Zero Results</span>
                  <p className="text-xs text-brand-ice/60 max-w-xs mx-auto font-medium">No prospects found matching your current filter criteria or search parameters.</p>
                  <Button variant="outline" size="sm" onClick={onClearFilters} className="mt-2 rounded-lg font-bold bg-[#051126] border-white/10 text-brand-ice hover:bg-transparent/5">Clear All filters</Button>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            leads.map((lead) => {
              const source = sources.find((s) => s.id === lead.sourceId);
              return (
                <TableRow 
                  key={lead.id} 
                  className="group hover:bg-transparent/5 transition-all cursor-pointer border-l-4 border-l-transparent hover:border-l-brand-electric border-b border-white/5"
                  onClick={() => onViewProfile(lead.id)}
                >
                  <TableCell className="px-8">
                    <div className="flex items-center space-x-4">
                      <div className={`h-11 w-11 rounded-2xl flex items-center justify-center text-[10px] font-black border border-white/10 shadow-lg shadow-black/50 ${getStatusColor(lead.status).split(' ')[0] || 'bg-brand-deep/30 text-brand-ice'}`}>
                        {lead.firstName?.charAt(0)}{lead.lastName?.charAt(0)}
                      </div>
                      <div>
                        <div className="font-bold text-brand-ice group-hover:text-brand-electric transition-colors text-sm">{lead.firstName} {lead.lastName}</div>
                        <div className="flex items-center space-x-2 mt-1">
                          <div className="text-[10px] text-brand-ice/40 font-bold bg-[#051126] px-1.5 py-0.5 rounded border border-white/10 tracking-tighter">#{lead.id.substring(0,8)}</div>
                          <div className="flex items-center text-[10px] text-brand-ice/60 font-medium italic">
                            <Globe className="h-2.5 w-2.5 mr-1 text-brand-ice/30" />
                            {lead.country}
                          </div>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1.5">
                      <div className="flex items-center text-[11px] font-bold text-brand-ice/80">
                        <Target className="h-3 w-3 mr-1.5 text-brand-electric/50" />
                        {source?.name || 'Direct / Referral'}
                      </div>
                      <div className="flex items-center text-[10px] text-brand-ice/40 font-medium group/phone" onClick={(e) => handleCopyPhone(e, lead.phoneNumber)}>
                        <Phone className="h-2.5 w-2.5 mr-1.5" />
                        {lead.phoneNumber}
                        <Copy className="h-2.5 w-2.5 ml-2 opacity-0 group-hover/phone:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`${getStatusColor(lead.status)} px-3 py-1 border shadow-none text-[10px] font-bold rounded-lg tracking-tight`}>
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`${PRIORITY_COLORS[lead.priority] || 'bg-[#01081A]'} px-3 py-1 border shadow-none text-[10px] font-bold rounded-lg tracking-tight`}>
                      {lead.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="font-black text-brand-ice text-sm">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: lead.currency || 'USD', maximumFractionDigits: 0 }).format(lead.estimatedValue || 0)}
                    </div>
                    <div className="text-[10px] text-brand-ice/40 font-bold tracking-widest mt-0.5">EST. POTENTIAL</div>
                  </TableCell>
                  <TableCell className="text-right pr-8" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end space-x-2">
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-brand-ice/40 hover:text-brand-electric hover:bg-brand-electric/10 rounded-xl transition-all" onClick={(e) => { e.stopPropagation(); onEdit(lead.id); }}>
                        <Edit className="h-4.5 w-4.5" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-brand-ice/40 hover:text-brand-ice hover:bg-transparent/5 rounded-xl transition-all">
                            <MoreVertical className="h-4.5 w-4.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 shadow-2xl border-white/10 bg-[#051126] text-brand-ice rounded-xl p-2 animate-in slide-in-from-top-1 duration-200">
                          <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-brand-ice/40 px-3 py-2">Operations</DropdownMenuLabel>
                          <DropdownMenuItem className="rounded-lg font-bold hover:bg-transparent/5 py-2.5 cursor-pointer" onClick={() => onViewProfile(lead.id)}>
                            <ExternalLink className="mr-3 h-4 w-4 text-brand-electric" /> View Detailed Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="rounded-lg font-bold hover:bg-transparent/5 py-2.5 cursor-pointer"
                            onClick={() => onOpenConversation((lead.conversation as any)?.id)}
                          >
                            <MessageSquare className="mr-3 h-4 w-4 text-emerald-500" /> Open Conversation
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="my-2 bg-transparent/10" />
                          <DropdownMenuItem className="rounded-lg font-bold text-red-400 focus:text-red-400 focus:bg-red-950/50 hover:bg-red-950/50 py-2.5 cursor-pointer" onClick={() => onDelete(lead.id)}>
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
  );
}
