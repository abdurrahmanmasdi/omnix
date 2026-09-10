'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  usePipelineStagesControllerFindAll,
  usePipelineStagesControllerRemove,
  usePipelineStagesControllerReorder,
} from '@/lib/api/generated/pipeline-stages/pipeline-stages';
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
import { Layers, Plus, Loader2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { PipelineStageFormModal } from '@/components/pipeline-stages/PipelineStageFormModal';
import { SortableStageRow } from '@/components/pipeline-stages/SortableStageRow';

interface PipelineStage {
  id: string;
  name: string;
  orderIndex: number;
  mappedStatus?: string;
}

export default function PipelineStagesPage() {
  const { data, isLoading, refetch } = usePipelineStagesControllerFindAll();
  const deleteMutation = usePipelineStagesControllerRemove();
  const reorderMutation = usePipelineStagesControllerReorder();

  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [localStages, setLocalStages] = useState<PipelineStage[]>([]);

  // Sync server data to local state
  useEffect(() => {
    if (data) {
      const d = data as any;
      const arr = Array.isArray(d) ? d : d?.items || d?.data || [];
      const sorted = [...arr].sort((a: PipelineStage, b: PipelineStage) => a.orderIndex - b.orderIndex);
      setLocalStages(sorted);
    }
  }, [data]);

  const stageIds = useMemo(() => localStages.map(s => s.id), [localStages]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Optimistic Update
    const oldIndex = localStages.findIndex(s => s.id === active.id);
    const newIndex = localStages.findIndex(s => s.id === over.id);
    const reordered = arrayMove(localStages, oldIndex, newIndex);
    
    // Update local state instantly
    setLocalStages(reordered);

    // Build the bulk reorder payload
    const payload = reordered.map((stage, index) => ({
      id: stage.id,
      orderIndex: index,
    }));

    reorderMutation.mutate(
      { data: { stages: payload } },
      {
        onSuccess: () => {
          toast.success('Pipeline reordered');
          refetch(); // Ensure sync with server
        },
        onError: () => {
          toast.error('Failed to reorder pipeline');
          refetch(); // Revert to server state on failure
        },
      }
    );
  }, [localStages, reorderMutation, refetch]);

  const handleEdit = (id: string) => {
    setSelectedStageId(id);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedStageId(null);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure? Leads in this stage may become unassigned.')) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast.success('Stage removed');
          refetch();
        },
        onError: () => toast.error('Failed to remove stage.')
      });
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-[1200px] mx-auto animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-brand-ice tracking-tight flex items-center">
            PIPELINE STAGES
            <Badge variant="outline" className="ml-3 bg-indigo-600 text-white border-none px-2 py-0 h-5 text-[10px] font-black tracking-tighter">SETTINGS</Badge>
          </h1>
          <p className="text-brand-ice/60 font-medium mt-1">Define and reorder the columns of your sales Kanban board.</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 shadow-none shadow-indigo-200 h-11 rounded-xl font-bold transition-all active:scale-95"
            onClick={handleCreate}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Stage
          </Button>
        </div>
      </div>

      {/* Reorder hint */}
      <div className="flex items-center space-x-3 px-5 py-3 bg-brand-electric/10/60 border border-indigo-100 rounded-xl text-[11px] font-bold text-brand-cyan">
        <GripVertical className="h-4 w-4 text-indigo-400 shrink-0" />
        <span>Drag the handle on each row to reorder pipeline stages. Changes are saved instantly.</span>
      </div>

      {/* Table */}
      <Card className="shadow-2xl shadow-none border-white/10 overflow-hidden rounded-2xl bg-transparent/80 backdrop-blur-xl">
        <CardHeader className="border-b border-white/10 py-5 px-8 flex flex-row items-center justify-between bg-transparent/50">
          <div className="flex items-center space-x-2 text-sm font-bold text-brand-ice/80 uppercase tracking-widest">
            <Layers className="h-5 w-5 text-indigo-500" />
            <span>Pipeline Flow</span>
          </div>
          <Badge className="bg-brand-deep text-brand-ice/60 hover:bg-slate-200 shadow-inner font-black px-3 py-1">
            {localStages.length} Stages
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-brand-navy/50 hover:bg-brand-navy/50 border-b border-white/10">
                  <TableHead className="w-12 px-4"></TableHead>
                  <TableHead className="font-bold text-[11px] uppercase tracking-widest text-brand-ice/60 h-14 px-8">Stage Name</TableHead>
                  <TableHead className="font-bold text-[11px] uppercase tracking-widest text-brand-ice/60 h-14">Order</TableHead>
                  <TableHead className="text-right font-bold text-[11px] uppercase tracking-widest text-brand-ice/60 h-14 pr-8">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center space-y-4">
                        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                        <span className="text-sm font-bold text-brand-ice/60 uppercase tracking-widest">Loading Pipeline...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : localStages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-48 text-center">
                      <p className="text-sm font-medium text-brand-ice/60">No pipeline stages configured yet.</p>
                      <Button variant="link" onClick={handleCreate} className="text-indigo-600 font-bold mt-2">Create your first stage</Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext items={stageIds} strategy={verticalListSortingStrategy}>
                      {localStages.map((stage) => (
                        <SortableStageRow
                          key={stage.id}
                          stage={stage}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <PipelineStageFormModal
        isOpen={isModalOpen}
        stageId={selectedStageId}
        onClose={() => setIsModalOpen(false)}
        onSuccess={refetch}
      />
    </div>
  );
}
