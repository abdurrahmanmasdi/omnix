'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TableRow, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GripVertical, Edit, Trash2, MoreVertical } from 'lucide-react';

interface SortableStageRowProps {
  stage: { id: string; name: string; orderIndex: number };
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function SortableStageRow({ stage, onEdit, onDelete }: SortableStageRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={`group hover:bg-slate-50/80 transition-all border-l-4 border-l-transparent hover:border-l-indigo-600 ${isDragging ? 'bg-indigo-50/50 shadow-lg rounded-xl' : ''}`}
    >
      <TableCell className="w-12 px-4">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-slate-600 transition-colors touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>

      <TableCell className="px-8">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-black text-xs shadow-inner">
            {stage.orderIndex + 1}
          </div>
          <span className="font-bold text-slate-800 text-sm">{stage.name}</span>
        </div>
      </TableCell>

      <TableCell>
        <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 px-3 py-1 text-[10px] font-bold rounded-lg tracking-tight shadow-sm">
          INDEX {stage.orderIndex}
        </Badge>
      </TableCell>

      <TableCell className="text-right pr-8">
        <div className="flex items-center justify-end space-x-2">
          <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" onClick={() => onEdit(stage.id)}>
            <Edit className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 shadow-2xl border-slate-100 rounded-xl p-2 animate-in slide-in-from-top-1 duration-200">
              <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-3 py-2">Operations</DropdownMenuLabel>
              <DropdownMenuItem className="rounded-lg font-bold text-slate-700 py-2.5 cursor-pointer" onClick={() => onEdit(stage.id)}>
                <Edit className="mr-3 h-4 w-4 text-indigo-500" /> Rename Stage
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-2 bg-slate-100" />
              <DropdownMenuItem className="rounded-lg font-bold text-red-600 focus:text-red-600 focus:bg-red-50 py-2.5 cursor-pointer" onClick={() => onDelete(stage.id)}>
                <Trash2 className="mr-3 h-4 w-4" /> Remove Stage
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
