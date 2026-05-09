'use client';

import { useState } from 'react';
import { 
  useLeadSourcesControllerFindAll, 
  useLeadSourcesControllerRemove 
} from '@/lib/api/generated/lead-sources/lead-sources';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Target, Plus, Loader2, Edit, Trash2, MoreVertical } from 'lucide-react';
import { toast } from 'sonner';
import { LeadSourceFormModal } from '@/components/lead-sources/LeadSourceFormModal';

export default function LeadSourcesPage() {
  const { data, isLoading, refetch } = useLeadSourcesControllerFindAll();
  const deleteMutation = useLeadSourcesControllerRemove();

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const sources = Array.isArray(data) ? data : ((data as any)?.items || []);

  const handleEdit = (id: string) => {
    setSelectedSourceId(id);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedSourceId(null);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this source? This may affect historical attribution metrics.')) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast.success('Source deleted successfully');
          refetch();
        },
        onError: () => toast.error('Failed to delete source. It might be in use.')
      });
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-[1200px] mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center">
            MARKETING SOURCES
            <Badge variant="outline" className="ml-3 bg-purple-600 text-white border-none px-2 py-0 h-5 text-[10px] font-black tracking-tighter">SETTINGS</Badge>
          </h1>
          <p className="text-slate-500 font-medium mt-1">Configure attribution channels for patient origin tracking.</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button 
            className="bg-purple-600 hover:bg-purple-700 shadow-xl shadow-purple-200 h-11 rounded-xl font-bold transition-all active:scale-95" 
            onClick={handleCreate}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Source
          </Button>
        </div>
      </div>

      <Card className="shadow-2xl shadow-slate-200/40 border-slate-100 overflow-hidden rounded-2xl bg-white/80 backdrop-blur-xl">
        <CardHeader className="border-b border-slate-100 py-5 px-8 flex flex-row items-center justify-between bg-white/50">
          <div className="flex items-center space-x-2 text-sm font-bold text-slate-700 uppercase tracking-widest">
            <Target className="h-5 w-5 text-purple-500" />
            <span>Configured Channels</span>
          </div>
          <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-200 shadow-inner font-black px-3 py-1">
            {sources.length} Total
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-b border-slate-100">
                  <TableHead className="font-bold text-[11px] uppercase tracking-widest text-slate-500 h-14 px-8 w-2/3">Channel Name</TableHead>
                  <TableHead className="font-bold text-[11px] uppercase tracking-widest text-slate-500 h-14">Status</TableHead>
                  <TableHead className="text-right font-bold text-[11px] uppercase tracking-widest text-slate-500 h-14 pr-8">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center space-y-4">
                        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                        <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">Loading Channels...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : sources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-48 text-center">
                      <p className="text-sm font-medium text-slate-500">No marketing sources configured.</p>
                      <Button variant="link" onClick={handleCreate} className="text-purple-600 font-bold mt-2">Create your first source</Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  sources.map((source: any) => (
                    <TableRow 
                      key={source.id} 
                      className="group hover:bg-slate-50/80 transition-all border-l-4 border-l-transparent hover:border-l-purple-600"
                    >
                      <TableCell className="px-8 font-bold text-slate-800 text-sm">
                        {source.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`${source.isActive !== false ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-slate-500/10 text-slate-600 border-slate-500/20'} px-3 py-1 border shadow-sm text-[10px] font-bold rounded-lg tracking-tight`}>
                          {source.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex items-center justify-end space-x-2">
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all" onClick={() => handleEdit(source.id)}>
                            <Edit className="h-4.5 w-4.5" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all">
                                <MoreVertical className="h-4.5 w-4.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 shadow-2xl border-slate-100 rounded-xl p-2 animate-in slide-in-from-top-1 duration-200">
                              <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-3 py-2">Operations</DropdownMenuLabel>
                              <DropdownMenuItem className="rounded-lg font-bold text-slate-700 py-2.5 cursor-pointer" onClick={() => handleEdit(source.id)}>
                                <Edit className="mr-3 h-4 w-4 text-purple-500" /> Edit Channel
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="my-2 bg-slate-100" />
                              <DropdownMenuItem className="rounded-lg font-bold text-red-600 focus:text-red-600 focus:bg-red-50 py-2.5 cursor-pointer" onClick={() => handleDelete(source.id)}>
                                <Trash2 className="mr-3 h-4 w-4" /> Delete Channel
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <LeadSourceFormModal 
        isOpen={isModalOpen}
        sourceId={selectedSourceId}
        onClose={() => setIsModalOpen(false)}
        onSuccess={refetch}
      />
    </div>
  );
}
