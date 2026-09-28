'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pipelineStageSchema, PipelineStageFormData } from '@/lib/validations/pipeline-stage';
import {
  usePipelineStagesControllerCreate,
  usePipelineStagesControllerUpdate,
  usePipelineStagesControllerFindOne,
} from '@/lib/api/generated/pipeline-stages/pipeline-stages';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Save, Layers } from 'lucide-react';
import { toast } from 'sonner';

interface PipelineStageFormModalProps {
  stageId?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PipelineStageFormModal({ stageId, isOpen, onClose, onSuccess }: PipelineStageFormModalProps) {
  const isEdit = !!stageId;

  const { data: existingStage, isLoading: isFetching } = usePipelineStagesControllerFindOne(
    stageId as string,
    { query: { enabled: !!stageId && isOpen } }
  );

  const createMutation = usePipelineStagesControllerCreate();
  const updateMutation = usePipelineStagesControllerUpdate();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<PipelineStageFormData>({
    resolver: zodResolver(pipelineStageSchema) as any,
    defaultValues: { name: '', mappedStatus: 'UNMAPPED' },
  });

  useEffect(() => {
    if (existingStage && isEdit) {
      const data = existingStage as { name?: string; mappedStatus?: string };
      reset({ name: data.name || '', mappedStatus: data.mappedStatus || 'UNMAPPED' });
    } else if (!isEdit && isOpen) {
      reset({ name: '', mappedStatus: 'UNMAPPED' });
    }
  }, [existingStage, isEdit, reset, isOpen]);

  const onSubmit = (data: PipelineStageFormData) => {
    if (isEdit && stageId) {
      updateMutation.mutate(
        { id: stageId, data: data as unknown as Parameters<typeof updateMutation.mutate>[0]['data'] },
        {
          onSuccess: () => {
            toast.success('Stage updated');
            onSuccess();
            onClose();
          },
          onError: () => toast.error('Failed to update stage'),
        }
      );
    } else {
      createMutation.mutate(
        { data: data as unknown as Parameters<typeof createMutation.mutate>[0]['data'] },
        {
          onSuccess: () => {
            toast.success('Stage created');
            onSuccess();
            onClose();
          },
          onError: () => toast.error('Failed to create stage'),
        }
      );
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[460px] flex flex-col p-0 border-none shadow-2xl rounded-2xl overflow-hidden">
        <DialogHeader className="p-8 pb-6 bg-[#051126] border-b border-white/5">
          <div className="flex items-center space-x-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Layers size={20} />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-slate-900">
                {isEdit ? 'Edit Pipeline Stage' : 'New Pipeline Stage'}
              </DialogTitle>
              <DialogDescription className="text-brand-ice/60 font-medium">
                {isEdit ? 'Rename this Kanban column.' : 'Add a new column to your sales pipeline.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isFetching && isEdit ? (
          <div className="flex h-36 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit as any)} className="flex-1 flex flex-col">
            <div className="p-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">Stage Name</Label>
                <Input
                  id="name"
                  {...register('name')}
                  placeholder="e.g. Qualified, Proposal Sent, Negotiation"
                  className="h-11 rounded-lg border-white/10 focus:ring-indigo-500/20"
                />
                {errors.name && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.name.message}</p>}
              </div>

              <div className="space-y-2 pt-2">
                <Label htmlFor="mappedStatus" className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">AI Status Mapping (Optional)</Label>
                <Controller
                  name="mappedStatus"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || 'UNMAPPED'}>
                      <SelectTrigger className="h-11 rounded-lg border-white/10 focus:ring-indigo-500/20">
                        <SelectValue placeholder="No Mapping (Manual Stage)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UNMAPPED">No Mapping (Manual Stage)</SelectItem>
                        <SelectItem value="NEW">NEW</SelectItem>
                        <SelectItem value="QUALIFYING">QUALIFYING</SelectItem>
                        <SelectItem value="QUALIFIED">QUALIFIED</SelectItem>
                        <SelectItem value="READY_TO_BOOK">READY_TO_BOOK</SelectItem>
                        <SelectItem value="READY_TO_PAY">READY_TO_PAY</SelectItem>
                        <SelectItem value="HANDED_OFF">HANDED_OFF</SelectItem>
                        <SelectItem value="UNQUALIFIED">UNQUALIFIED</SelectItem>
                        <SelectItem value="WON">WON</SelectItem>
                        <SelectItem value="LOST">LOST</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-[11px] text-brand-ice/60 mt-1">Select an AI status to automatically move leads into this column when their status changes. Leave blank for a purely manual pipeline stage.</p>
              </div>
            </div>

            <DialogFooter className="p-8 pt-6 border-t border-white/5 bg-[#051126]">
              <div className="flex items-center justify-end w-full space-x-3">
                <Button type="button" variant="outline" onClick={onClose} className="h-11 px-6 rounded-xl font-bold border-white/10 shadow-none">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-11 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 shadow-none shadow-indigo-100 font-bold transition-all active:scale-95"
                  disabled={isPending}
                >
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {isEdit ? 'Save Changes' : 'Create Stage'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
