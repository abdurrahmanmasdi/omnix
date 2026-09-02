'use client';

import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  DndContext, 
  DragOverlay, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import { 
  SortableContext, 
  arrayMove, 
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Loader2, MessageSquare, AlertCircle, Calendar, Phone, Mail } from 'lucide-react';
import { usePipelineStagesControllerFindAll } from '@/lib/api/generated/pipeline-stages/pipeline-stages';
import { useLeadsControllerUpdateStage } from '@/lib/api/generated/leads/leads';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// --- Types ---
type Lead = any; // Assuming `leads` passed in is an array of `any` from Orval's paginated response
type Stage = any;

interface KanbanBoardProps {
  leads: Lead[];
  isLoading: boolean;
  onEdit: (id: string) => void;
  onViewProfile: (id: string) => void;
  onOpenConversation: (conversationId?: string) => void;
}

// --- Subcomponents ---

interface SortableLeadCardProps {
  lead: Lead;
  onViewProfile: (id: string) => void;
  onOpenConversation: (conversationId?: string) => void;
}

function LeadCard({ lead, onViewProfile, onOpenConversation, isOverlay, style, ref, ...props }: SortableLeadCardProps & { isOverlay?: boolean, style?: React.CSSProperties, ref?: React.Ref<HTMLDivElement> }) {
  const isHandedOff = lead.status === 'HANDED_OFF';
  
  return (
    <div 
      ref={ref}
      style={style}
      className={`bg-white border rounded-lg p-3 shadow-sm flex flex-col gap-2 cursor-grab active:cursor-grabbing hover:border-blue-300 transition-colors ${isOverlay ? 'shadow-xl rotate-2 scale-105' : ''} ${isHandedOff ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200'}`}
      {...props}
    >
      <div className="flex justify-between items-start">
        <h4 className="font-semibold text-slate-900 text-sm">{lead.firstName} {lead.lastName}</h4>
        {isHandedOff && (
          <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">
            HANDED OFF
          </Badge>
        )}
      </div>
      
      <div className="flex flex-col gap-1 mt-1">
        {lead.phoneNumber && (
          <div className="flex items-center text-xs text-slate-500">
            <Phone className="h-3 w-3 mr-1" />
            {lead.phoneNumber}
          </div>
        )}
        {lead.email && (
          <div className="flex items-center text-xs text-slate-500">
            <Mail className="h-3 w-3 mr-1" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
        <div className="text-[10px] text-slate-400 font-medium">
          {new Date(lead.createdAt).toLocaleDateString()}
        </div>
        <div className="flex gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
            onClick={(e) => { e.stopPropagation(); onViewProfile(lead.id); }}
            onPointerDown={(e) => e.stopPropagation()} // Prevent drag start when clicking button
          >
            <Calendar className="h-3 w-3" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className={`h-6 w-6 ${lead.conversationId ? 'text-slate-400 hover:text-blue-600 hover:bg-blue-50' : 'text-slate-300 cursor-not-allowed'}`}
            onClick={(e) => { e.stopPropagation(); onOpenConversation(lead.conversationId); }}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={!lead.conversationId}
          >
            <MessageSquare className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

const SortableLeadCard = React.forwardRef<HTMLDivElement, SortableLeadCardProps>(({ lead, onViewProfile, onOpenConversation }, ref) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: lead.id,
    data: {
      type: 'Lead',
      lead,
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <LeadCard 
      ref={setNodeRef}
      style={style}
      lead={lead} 
      onViewProfile={onViewProfile} 
      onOpenConversation={onOpenConversation}
      {...attributes}
      {...listeners}
    />
  );
});
SortableLeadCard.displayName = 'SortableLeadCard';

// --- Main Board Component ---

export function KanbanBoard({ leads, isLoading, onViewProfile, onOpenConversation }: KanbanBoardProps) {
  const queryClient = useQueryClient();
  const { data: stagesData, isLoading: stagesLoading } = usePipelineStagesControllerFindAll();
  const updateStageMutation = useLeadsControllerUpdateStage();

  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  // We need to manage optimistic state locally during drag and drop
  // because relying solely on React Query cache updates during the fast drag events can be clunky.
  const [localLeads, setLocalLeads] = useState<Lead[]>(leads);

  // Sync local state when fresh leads come from props
  React.useEffect(() => {
    setLocalLeads(leads);
  }, [leads]);

  const stages = useMemo(() => {
    const d = stagesData as any;
    if (Array.isArray(d)) return d;
    if (d?.items) return d.items;
    return [];
  }, [stagesData]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Requires 5px movement before dragging starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Group leads by stage id
  const columns = useMemo(() => {
    const cols: Record<string, Lead[]> = {};
    stages.forEach((stage: Stage) => {
      cols[stage.id] = [];
    });
    localLeads.forEach((lead) => {
      if (lead.pipelineStageId && cols[lead.pipelineStageId]) {
        cols[lead.pipelineStageId].push(lead);
      } else if (stages.length > 0) {
        // Fallback: if lead has no valid stage, put it in the first stage (optional)
        // cols[stages[0].id].push(lead); 
      }
    });
    
    // Sort leads inside columns by their internal order if needed, but for now we just keep array order
    return cols;
  }, [stages, localLeads]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeData = active.data.current;
    if (activeData?.type === 'Lead') {
      setActiveLead(activeData.lead);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveALead = active.data.current?.type === 'Lead';
    const isOverALead = over.data.current?.type === 'Lead';
    const isOverAColumn = over.data.current?.type === 'Column';

    if (!isActiveALead) return;

    setLocalLeads((prev) => {
      const activeItems = [...prev];
      const activeIndex = activeItems.findIndex((l) => l.id === activeId);
      
      if (activeIndex === -1) return prev;

      let newStageId = activeItems[activeIndex].pipelineStageId;

      if (isOverALead) {
        const overIndex = activeItems.findIndex((l) => l.id === overId);
        newStageId = activeItems[overIndex].pipelineStageId;
        
        if (activeItems[activeIndex].pipelineStageId !== newStageId) {
          activeItems[activeIndex] = { ...activeItems[activeIndex], pipelineStageId: newStageId };
          return arrayMove(activeItems, activeIndex, overIndex);
        }
      } else if (isOverAColumn) {
        newStageId = overId as string;
        if (activeItems[activeIndex].pipelineStageId !== newStageId) {
          activeItems[activeIndex] = { ...activeItems[activeIndex], pipelineStageId: newStageId };
          return [...activeItems];
        }
      }

      return prev;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLead(null);
    const { active, over } = event;
    
    if (!over) return;

    const activeLeadId = active.id as string;
    const activeLeadObj = leads.find(l => l.id === activeLeadId);
    if (!activeLeadObj) return;

    const originalStageId = activeLeadObj.pipelineStageId;
    
    // Find where it ended up in our local state
    const currentLocalLead = localLeads.find(l => l.id === activeLeadId);
    const newStageId = currentLocalLead?.pipelineStageId;

    if (newStageId && originalStageId !== newStageId) {
      // Optimistically update React Query Cache
      queryClient.setQueryData([`/leads`], (oldData: any) => {
        if (!oldData) return oldData;
        const processItems = (items: Lead[]) => items.map(item => 
          item.id === activeLeadId ? { ...item, pipelineStageId: newStageId } : item
        );

        if (Array.isArray(oldData)) return processItems(oldData);
        if (oldData.items) return { ...oldData, items: processItems(oldData.items) };
        if (oldData.data) return { ...oldData, data: processItems(oldData.data) };
        return oldData;
      });

      // Fire mutation
      updateStageMutation.mutate({
        id: activeLeadId,
        data: { pipelineStageId: newStageId }
      }, {
        onSuccess: () => {
          toast.success('Lead stage updated successfully');
        },
        onError: () => {
          toast.error('Failed to update lead stage');
          // Revert local state and query cache on error
          setLocalLeads(leads);
          queryClient.invalidateQueries({ queryKey: [`/leads`] });
        }
      });
    }
  };

  if (isLoading || stagesLoading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] text-slate-500">
        <AlertCircle className="h-10 w-10 mb-4 text-slate-300" />
        <h3 className="text-lg font-semibold text-slate-700">No Pipeline Stages</h3>
        <p>You need to create pipeline stages before using the Kanban board.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-250px)] overflow-x-auto p-2 gap-4 pb-4 snap-x">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {stages.map((stage: Stage) => (
          <KanbanColumn 
            key={stage.id} 
            stage={stage} 
            leads={columns[stage.id] || []} 
            onViewProfile={onViewProfile}
            onOpenConversation={onOpenConversation}
          />
        ))}

        <DragOverlay dropAnimation={{
          sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
        }}>
          {activeLead ? (
            <LeadCard 
              lead={activeLead} 
              isOverlay 
              onViewProfile={onViewProfile}
              onOpenConversation={onOpenConversation}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

interface KanbanColumnProps {
  stage: Stage;
  leads: Lead[];
  onViewProfile: (id: string) => void;
  onOpenConversation: (conversationId?: string) => void;
}

function KanbanColumn({ stage, leads, onViewProfile, onOpenConversation }: KanbanColumnProps) {
  const { setNodeRef } = useSortable({
    id: stage.id,
    data: {
      type: 'Column',
      stage,
    }
  });

  const leadIds = useMemo(() => leads.map(l => l.id), [leads]);

  return (
    <div 
      className="flex flex-col bg-slate-100/50 rounded-xl border border-slate-200 min-w-[320px] max-w-[320px] snap-center shrink-0 flex-1 overflow-hidden"
    >
      <div className="p-4 bg-white/50 border-b border-slate-200 flex justify-between items-center sticky top-0 backdrop-blur-md z-10">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          {stage.icon && <span className="text-lg">{stage.icon}</span>}
          {stage.name}
        </h3>
        <Badge variant="secondary" className="bg-slate-200 text-slate-600">
          {leads.length}
        </Badge>
      </div>

      <div 
        ref={setNodeRef}
        className="flex-1 p-3 flex flex-col gap-3 overflow-y-auto min-h-[150px]"
      >
        <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
          {leads.map(lead => (
            <SortableLeadCard 
              key={lead.id} 
              lead={lead} 
              onViewProfile={onViewProfile}
              onOpenConversation={onOpenConversation}
            />
          ))}
        </SortableContext>
        
        {leads.length === 0 && (
          <div className="flex-1 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center">
            <span className="text-sm font-medium text-slate-400">Drop leads here</span>
          </div>
        )}
      </div>
    </div>
  );
}
