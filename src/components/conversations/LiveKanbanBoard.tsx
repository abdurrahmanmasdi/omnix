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
import { Loader2, MessageSquare, AlertCircle, Phone, Mail } from 'lucide-react';
import { usePipelineStagesControllerFindAll } from '@/lib/api/generated/pipeline-stages/pipeline-stages';
import { useLeadsControllerUpdateStage } from '@/lib/api/generated/leads/leads';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

// --- Types ---
type Lead = any; 
type Stage = any;

interface LiveKanbanBoardProps {
  leads: Lead[];
  isLoading: boolean;
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
}

// --- Subcomponents ---

interface SortableLeadCardProps {
  lead: Lead;
  isActiveConversation: boolean;
  onSelectConversation: (conversationId: string) => void;
}

function LeadCard({ 
  lead, 
  isActiveConversation, 
  onSelectConversation, 
  isOverlay, 
  style, 
  ref, 
  ...props 
}: SortableLeadCardProps & { isOverlay?: boolean, style?: React.CSSProperties, ref?: React.Ref<HTMLDivElement> }) {
  const isHandedOff = lead.status === 'HANDED_OFF';
  
  return (
    <div 
      ref={ref}
      style={style}
      onClick={() => {
        if (lead.conversationId) {
          onSelectConversation(lead.conversationId);
        }
      }}
      className={`bg-transparent border rounded-lg p-3 shadow-none flex flex-col gap-2 cursor-grab active:cursor-grabbing transition-colors 
      ${isOverlay ? 'shadow-none rotate-2 scale-105' : ''} 
      ${isActiveConversation ? 'border-blue-500 bg-brand-electric/10/50 ring-2 ring-blue-500/20' : 'hover:border-brand-electric/30'}
      ${isHandedOff && !isActiveConversation ? 'border-amber-500/20 bg-amber-500/200/10' : !isActiveConversation ? 'border-white/10' : ''}`}
      {...props}
    >
      <div className="flex justify-between items-start">
        <h4 className="font-semibold text-brand-ice text-sm truncate pr-2">{lead.firstName} {lead.lastName}</h4>
        <div className="flex flex-col items-end gap-1">
          {isHandedOff && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-amber-500/20 text-amber-400 border-amber-500/20 uppercase whitespace-nowrap">
              Handed Off
            </Badge>
          )}
          {lead.conversationId && (
            <MessageSquare className={`h-4 w-4 ${isActiveConversation ? 'text-brand-cyan' : 'text-brand-ice/40'}`} />
          )}
        </div>
      </div>
      
      <div className="flex flex-col gap-1 mt-1">
        {lead.phoneNumber && (
          <div className="flex items-center text-xs text-brand-ice/60">
            <Phone className="h-3 w-3 mr-1" />
            {lead.phoneNumber}
          </div>
        )}
        {lead.email && (
          <div className="flex items-center text-xs text-brand-ice/60">
            <Mail className="h-3 w-3 mr-1" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/10">
        <span className="text-[10px] text-brand-ice/60 font-medium">
          {new Date(lead.createdAt).toLocaleDateString()}
        </span>
        {!lead.conversationId && (
          <span className="text-[10px] text-brand-ice/60 italic">No Chat</span>
        )}
      </div>
    </div>
  );
}

const SortableLeadCard = React.forwardRef<HTMLDivElement, SortableLeadCardProps>(({ lead, isActiveConversation, onSelectConversation }, ref) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: lead.id,
    data: { type: 'Lead', lead }
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
      isActiveConversation={isActiveConversation}
      onSelectConversation={onSelectConversation}
      {...attributes}
      {...listeners}
    />
  );
});
SortableLeadCard.displayName = 'SortableLeadCard';

// --- Main Board Component ---

export function LiveKanbanBoard({ leads, isLoading, activeConversationId, onSelectConversation }: LiveKanbanBoardProps) {
  const queryClient = useQueryClient();
  const { data: stagesData, isLoading: stagesLoading } = usePipelineStagesControllerFindAll();
  const updateStageMutation = useLeadsControllerUpdateStage();

  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  // Optimistic local state for drag and drop
  const [localLeads, setLocalLeads] = useState<Lead[]>(leads);

  React.useEffect(() => {
    setLocalLeads(leads);
  }, [leads]);

  const stages = useMemo(() => {
    const d = stagesData as any;
    if (Array.isArray(d)) return d;
    if (d?.items) return d.items;
    return [];
  }, [stagesData]);

  const extendedStages = useMemo(() => {
    return [
      { id: 'needs-attention', name: 'Needs Attention', icon: '🚨', isVirtual: true },
      ...stages
    ];
  }, [stages]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const columns = useMemo(() => {
    const cols: Record<string, Lead[]> = {};
    extendedStages.forEach((stage: Stage | any) => {
      cols[stage.id] = [];
    });
    localLeads.forEach((lead) => {
      if (lead.status === 'HANDED_OFF') {
        cols['needs-attention'].push(lead);
      } else if (lead.pipelineStageId && cols[lead.pipelineStageId]) {
        cols[lead.pipelineStageId].push(lead);
      }
    });
    return cols;
  }, [extendedStages, localLeads]);

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
    
    const currentLocalLead = localLeads.find(l => l.id === activeLeadId);
    const newStageId = currentLocalLead?.pipelineStageId;

    if (newStageId && originalStageId !== newStageId) {
      // Optimistically update React Query Cache for ALL `/leads` queries
      queryClient.setQueriesData({ queryKey: [`/leads`] }, (oldData: any) => {
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
          setLocalLeads(leads);
          queryClient.invalidateQueries({ queryKey: [`/leads`] });
        }
      });
    }
  };

  if (isLoading || stagesLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <Loader2 className="h-8 w-8 animate-spin text-brand-cyan" />
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-brand-ice/60">
        <AlertCircle className="h-10 w-10 mb-4 text-brand-ice/40" />
        <h3 className="text-lg font-semibold text-brand-ice/80">No Pipeline Stages</h3>
        <p>You need to create pipeline stages in settings before using the Live Inbox.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-x-auto p-4 gap-4 pb-4 snap-x bg-[#051126]/50 flex-1">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {extendedStages.map((stage: Stage | any) => (
          <KanbanColumn 
            key={stage.id} 
            stage={stage} 
            leads={columns[stage.id] || []} 
            activeConversationId={activeConversationId}
            onSelectConversation={onSelectConversation}
          />
        ))}

        <DragOverlay dropAnimation={{
          sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
        }}>
          {activeLead ? (
            <LeadCard 
              lead={activeLead} 
              isOverlay 
              isActiveConversation={activeLead.conversationId === activeConversationId}
              onSelectConversation={onSelectConversation}
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
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
}

function KanbanColumn({ stage, leads, activeConversationId, onSelectConversation }: KanbanColumnProps) {
  const isVirtual = stage.isVirtual;

  const { setNodeRef } = useSortable({
    id: stage.id,
    data: {
      type: 'Column',
      stage,
    }
  });

  const leadIds = useMemo(() => leads.map(l => l.id), [leads]);

  return (
    <div className={`flex flex-col rounded-xl border min-w-[300px] max-w-[300px] snap-center shrink-0 flex-1 overflow-hidden shadow-none ${isVirtual ? 'bg-amber-500/20/40 border-amber-500/20' : 'bg-[#01081A]/60 border-white/10'}`}>
      <div className={`p-3 border-b flex justify-between items-center sticky top-0 backdrop-blur-md z-10 ${isVirtual ? 'bg-amber-500/20/70 border-amber-500/20' : 'bg-transparent/70 border-white/10'}`}>
        <h3 className={`font-bold flex items-center gap-2 text-sm uppercase tracking-wide ${isVirtual ? 'text-amber-800' : 'text-brand-ice/80'}`}>
          {stage.icon && <span className="text-base">{stage.icon}</span>}
          {stage.name}
        </h3>
        <Badge variant="secondary" className={`${isVirtual ? 'bg-amber-200 text-amber-900' : 'bg-slate-200 text-brand-ice/80'} font-bold`}>
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
              isActiveConversation={lead.conversationId === activeConversationId}
              onSelectConversation={onSelectConversation}
            />
          ))}
        </SortableContext>
        
        {leads.length === 0 && (
          <div className="flex-1 border-2 border-dashed border-white/10 rounded-lg flex items-center justify-center">
            <span className="text-sm font-medium text-brand-ice/60">Empty</span>
          </div>
        )}
      </div>
    </div>
  );
}
