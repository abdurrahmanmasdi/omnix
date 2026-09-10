'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { leadSourceSchema, LeadSourceFormData } from '@/lib/validations/lead-source';
import { 
  useLeadSourcesControllerCreate, 
  useLeadSourcesControllerUpdate, 
  useLeadSourcesControllerFindOne 
} from '@/lib/api/generated/lead-sources/lead-sources';
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
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, Target } from 'lucide-react';
import { toast } from 'sonner';

interface LeadSourceFormModalProps {
  sourceId?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function LeadSourceFormModal({ sourceId, isOpen, onClose, onSuccess }: LeadSourceFormModalProps) {
  const isEdit = !!sourceId;

  const { data: existingSource, isLoading: isFetching } = useLeadSourcesControllerFindOne(
    sourceId as string,
    { query: { enabled: !!sourceId && isOpen } }
  );

  const createMutation = useLeadSourcesControllerCreate();
  const updateMutation = useLeadSourcesControllerUpdate();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LeadSourceFormData>({
    resolver: zodResolver(leadSourceSchema),
    defaultValues: {
      name: '',
      isActive: true,
    }
  });

  const isActiveValue = watch('isActive');

  useEffect(() => {
    if (existingSource && isEdit) {
      const data = existingSource as any;
      reset({
        name: data.name,
        isActive: data.isActive !== undefined ? data.isActive : true,
      });
    } else if (!isEdit && isOpen) {
      reset({
        name: '',
        isActive: true,
      });
    }
  }, [existingSource, isEdit, reset, isOpen]);

  const onSubmit = (data: LeadSourceFormData) => {
    if (isEdit && sourceId) {
      updateMutation.mutate(
        { id: sourceId, data },
        {
          onSuccess: () => {
            toast.success('Source updated successfully');
            onSuccess();
            onClose();
          },
          onError: () => toast.error('Failed to update source'),
        }
      );
    } else {
      createMutation.mutate(
        { data },
        {
          onSuccess: () => {
            toast.success('Source created successfully');
            onSuccess();
            onClose();
          },
          onError: () => toast.error('Failed to create source'),
        }
      );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] flex flex-col p-0 border-none shadow-2xl rounded-2xl overflow-hidden">
        <DialogHeader className="p-8 pb-6 bg-[#051126] border-b border-white/5">
          <div className="flex items-center space-x-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-200">
              <Target size={20} />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-slate-900">{isEdit ? 'Edit Marketing Source' : 'New Marketing Source'}</DialogTitle>
              <DialogDescription className="text-brand-ice/60 font-medium">
                {isEdit ? 'Update details for this marketing attribution channel.' : 'Define a new channel where patient leads originate.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isFetching && isEdit ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col">
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">Source Name</Label>
                <Input 
                  id="name" 
                  {...register('name')} 
                  placeholder="e.g. TikTok Ads, Referral, Search SEO" 
                  className="h-11 rounded-lg border-white/10 focus:ring-purple-500/20" 
                />
                {errors.name && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.name.message}</p>}
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-[#051126]">
                <div className="space-y-0.5">
                  <Label className="text-sm font-bold text-slate-900">Active Status</Label>
                  <p className="text-[10px] font-medium text-brand-ice/60">Allow this source to be selected for new leads.</p>
                </div>
                <Switch 
                  checked={isActiveValue}
                  onCheckedChange={(checked) => setValue('isActive', checked)}
                />
              </div>
            </div>

            <DialogFooter className="p-8 pt-6 border-t border-white/5 bg-[#051126]">
              <div className="flex items-center justify-end w-full space-x-3">
                <Button type="button" variant="outline" onClick={onClose} className="h-11 px-6 rounded-xl font-bold border-white/10 shadow-none">
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="h-11 px-8 rounded-xl bg-purple-600 hover:bg-purple-700 shadow-none shadow-purple-100 font-bold transition-all active:scale-95" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {isEdit ? 'Save Changes' : 'Create Source'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
