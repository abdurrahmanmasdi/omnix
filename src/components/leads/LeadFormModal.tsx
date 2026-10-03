'use client';

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { leadSchema, LeadFormData } from '@/lib/validations/lead';
import { useLeadsControllerCreate, useLeadsControllerUpdate, useLeadsControllerFindOne } from '@/lib/api/generated/leads/leads';
import { useLeadSourcesControllerFindAll } from '@/lib/api/generated/lead-sources/lead-sources';
import { usePipelineStagesControllerFindAll } from '@/lib/api/generated/pipeline-stages/pipeline-stages';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Save, Link as LinkIcon, Info, Target, Globe, Phone, UserPlus, Mail } from 'lucide-react';
import { FaInstagram, FaFacebookF } from "react-icons/fa";

import { toast } from 'sonner';
import { CreateLeadDtoPriority } from '@/lib/api/model/createLeadDtoPriority';
import { isMasked } from '@/features/inbox/model';
import { dirtyLeadPatch } from './lead-edit-patch';
import { CreateLeadDtoCurrency } from '@/lib/api/model/createLeadDtoCurrency';

interface LeadFormModalProps {
  leadId?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function LeadFormModal({ leadId, isOpen, onClose, onSuccess }: LeadFormModalProps) {
  const isEdit = !!leadId;

  // 1. Fetch data
  const { data: existingLead, isLoading: isFetching } = useLeadsControllerFindOne(
    leadId as string,
    { query: { enabled: !!leadId && isOpen } }
  );

  const { data: sourcesData } = useLeadSourcesControllerFindAll({
    query: { enabled: isOpen }
  });
  
  const sources = useMemo(() => {
    const data = sourcesData as unknown as { items?: unknown[] } | unknown[];
    if (Array.isArray(data)) return data;
    if (data?.items) return data.items;
    return [];
  }, [sourcesData]);

  // Fetch pipeline stages dynamically
  const { data: stagesData } = usePipelineStagesControllerFindAll({
    query: { enabled: isOpen }
  });
  const stages = useMemo(() => {
    const d = stagesData as unknown as { items?: unknown[], data?: unknown[] } | unknown[];
    const arr = Array.isArray(d) ? d : d?.items || d?.data || [];
    return [...(arr as { orderIndex?: number, name: string, id: string }[])].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  }, [stagesData]);

  // 2. Mutations
  const createMutation = useLeadsControllerCreate();
  const updateMutation = useLeadsControllerUpdate();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, dirtyFields },
  } = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      status: 'NEW',
      priority: CreateLeadDtoPriority.WARM,
      currency: CreateLeadDtoCurrency.USD,
      estimatedValue: 0,
      timezone: 'UTC',
      primaryLanguage: 'en',
      socialLinks: {
        instagram: '',
        tiktok: '',
        facebook: '',
        twitter: '',
      }
    }
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const statusValue = watch('status');
  const priorityValue = watch('priority');
  const currencyValue = watch('currency');
  const sourceIdValue = watch('sourceId');

  // Sync form with existing lead
  useEffect(() => {
    if (existingLead && isEdit) {
      const data = existingLead as unknown as Record<string, unknown>;
      reset({
        firstName: data.firstName as string | undefined,
        lastName: data.lastName as string | undefined,
        phoneNumber: data.phoneNumber as string | undefined,
        country: data.country as string | undefined,
        email: isMasked(data.email as string | undefined) ? '' : (data.email as string | undefined) || '',
        status: (data.status as string) || 'NEW',
        priority: (data.priority as CreateLeadDtoPriority) || CreateLeadDtoPriority.WARM,
        currency: (data.currency as CreateLeadDtoCurrency) || CreateLeadDtoCurrency.USD,
        estimatedValue: (data.estimatedValue as number | undefined) || 0,
        timezone: (data.timezone as string | undefined) || 'UTC',
        primaryLanguage: (data.primaryLanguage as string | undefined) || 'en',
        expectedServiceDate: (data.expectedServiceDate as string | undefined) || '',
        sourceId: (data.sourceId as string | undefined) || 'none',
        socialLinks: {
          instagram: (data.socialLinks as Record<string, string>)?.instagram || '',
          tiktok: (data.socialLinks as Record<string, string>)?.tiktok || '',
          facebook: (data.socialLinks as Record<string, string>)?.facebook || '',
          twitter: (data.socialLinks as Record<string, string>)?.twitter || '',
        }
      });
    } else if (!isEdit && isOpen) {
      reset({
        firstName: '',
        lastName: '',
        phoneNumber: '',
        country: '',
        email: '',
        status: 'NEW',
        priority: CreateLeadDtoPriority.WARM,
        currency: CreateLeadDtoCurrency.USD,
        estimatedValue: 0,
        timezone: 'UTC',
        primaryLanguage: 'en',
        expectedServiceDate: '',
        sourceId: 'none',
        socialLinks: {
          instagram: '',
          tiktok: '',
          facebook: '',
          twitter: '',
        }
      });
    }
  }, [existingLead, isEdit, reset, isOpen]);

  const originalContacts = existingLead as { phoneNumber?: string; email?: string } | undefined;

  const onSubmit = (data: LeadFormData) => {
    const payload = { 
      ...data,
      sourceId: data.sourceId === 'none' ? undefined : data.sourceId,
    };
    
    if (isEdit && leadId) {
      updateMutation.mutate(
        { id: leadId, data: dirtyLeadPatch(payload as unknown as Parameters<typeof updateMutation.mutate>[0]['data'], dirtyFields, existingLead as Record<string, unknown>) },
        {
          onSuccess: () => {
            toast.success('Lead updated successfully');
            onSuccess();
            onClose();
          },
          onError: () => toast.error('Failed to update lead'),
        }
      );
    } else {
      createMutation.mutate(
        { data: payload as unknown as NonNullable<Parameters<typeof createMutation.mutate>[0]>['data'] },
        {
          onSuccess: () => {
            toast.success('Lead created successfully');
            onSuccess();
            onClose();
          },
          onError: () => toast.error('Failed to create lead'),
        }
      );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl">
        <DialogHeader className="p-8 pb-4 bg-brand-navy">
          <div className="flex items-center space-x-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-brand-electric flex items-center justify-center text-white shadow-lg shadow-brand-electric/20">
              <UserPlus size={20} />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-brand-ice">{isEdit ? 'Update Prospect' : 'Onboard New Patient'}</DialogTitle>
              <DialogDescription className="text-brand-ice/60 font-medium">
                {isEdit ? 'Refine patient details and clinical attribution.' : 'Enter new lead information to initiate AI qualification.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isFetching && isEdit ? (
          <div className="flex h-96 items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-brand-cyan" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-hidden flex flex-col">
            <Tabs defaultValue="basic" className="flex-1 overflow-hidden flex flex-col">
              <div className="px-8 border-b bg-brand-navy">
                <TabsList className="w-full justify-start bg-transparent h-14 p-0 space-x-8">
                  <TabsTrigger value="basic" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent shadow-none px-0 h-full text-sm font-bold uppercase tracking-widest text-brand-ice/60 data-[state=active]:text-brand-cyan">
                    <Info className="h-4 w-4 mr-2" /> Basic Identity
                  </TabsTrigger>
                  <TabsTrigger value="attribution" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent shadow-none px-0 h-full text-sm font-bold uppercase tracking-widest text-brand-ice/60 data-[state=active]:text-brand-cyan">
                    <Target className="h-4 w-4 mr-2" /> Attribution
                  </TabsTrigger>
                  <TabsTrigger value="social" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent shadow-none px-0 h-full text-sm font-bold uppercase tracking-widest text-brand-ice/60 data-[state=active]:text-brand-cyan">
                    <FaInstagram className="h-4 w-4 mr-2" /> Social Presence
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                <TabsContent value="basic" className="mt-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="firstName" className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">First Name</Label>
                      <Input id="firstName" {...register('firstName')} placeholder="e.g. Ahmet" className="h-11 rounded-lg border-white/10 focus:ring-blue-500/20" />
                      {errors.firstName && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.firstName.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName" className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">Last Name</Label>
                      <Input id="lastName" {...register('lastName')} placeholder="e.g. Yilmaz" className="h-11 rounded-lg border-white/10 focus:ring-blue-500/20" />
                      {errors.lastName && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.lastName.message}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="phoneNumber" className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">Phone Number</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-ice/60" />
                        <Input id="phoneNumber" readOnly={isEdit && isMasked(originalContacts?.phoneNumber)} {...register('phoneNumber')} placeholder="+90 555..." className="pl-10 h-11 rounded-lg border-white/10 focus:ring-blue-500/20" />
                      </div>
                      {errors.phoneNumber && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.phoneNumber.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">Email Address</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-ice/60" />
                        <Input id="email" readOnly={isEdit && isMasked(originalContacts?.email)} {...register('email')} placeholder="ahmet@example.com" className="pl-10 h-11 rounded-lg border-white/10 focus:ring-blue-500/20" />
                      </div>
                      {isEdit && isMasked(originalContacts?.email) && <p className="text-xs">{originalContacts?.email} · Masked contact details cannot be edited.</p>}
                      {errors.email && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.email.message}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="country" className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">Residence Country</Label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-ice/60" />
                        <Input id="country" {...register('country')} placeholder="e.g. Germany" className="pl-10 h-11 rounded-lg border-white/10 focus:ring-blue-500/20" />
                      </div>
                      {errors.country && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.country.message}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">Currency</Label>
                        <Select value={currencyValue} onValueChange={(val) => setValue('currency', val as CreateLeadDtoCurrency, { shouldDirty: true })}>
                          <SelectTrigger className="h-11 rounded-lg border-white/10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(CreateLeadDtoCurrency).map(opt => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="estimatedValue" className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">Value</Label>
                        <Input id="estimatedValue" type="number" {...register('estimatedValue', { valueAsNumber: true })} className="h-11 rounded-lg border-white/10" />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="attribution" className="mt-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">Marketing Attribution Source</Label>
                    <Select value={sourceIdValue} onValueChange={(val) => setValue('sourceId', val, { shouldDirty: true })}>
                      <SelectTrigger className="h-12 rounded-xl border-white/10 bg-transparent">
                        <SelectValue placeholder="Select how the patient found the clinic" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="font-medium">Direct Entry / Referral</SelectItem>
                        {(sources as { id: string, name: string }[]).map((s) => (
                          <SelectItem key={s.id} value={s.id} className="font-medium">{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-brand-ice/60 font-medium italic">A source helps staff understand where this enquiry came from.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-6 pt-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">Lifecycle Status</Label>
                      <Select value={statusValue} onValueChange={(val) => setValue('status', val as LeadFormData['status'], { shouldDirty: true })}>
                        <SelectTrigger className="h-11 rounded-lg border-white/10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {stages.map((stage: { id: string, name: string }) => (
                            <SelectItem key={stage.id} value={stage.name}>{stage.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">Sales Priority</Label>
                      <Select value={priorityValue} onValueChange={(val) => setValue('priority', val as CreateLeadDtoPriority, { shouldDirty: true })}>
                        <SelectTrigger className="h-11 rounded-lg border-white/10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(CreateLeadDtoPriority).map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="expectedServiceDate" className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">Expected Arrival Date</Label>
                      <Input id="expectedServiceDate" type="date" {...register('expectedServiceDate')} className="h-11 rounded-lg border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="primaryLanguage" className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">Patient Language</Label>
                      <Input id="primaryLanguage" {...register('primaryLanguage')} placeholder="e.g. Arabic, English" className="h-11 rounded-lg border-white/10" />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="social" className="mt-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="bg-brand-navy p-6 rounded-2xl border border-white/10 space-y-5">
                    <div className="space-y-2">
                      <Label className="flex items-center text-xs font-bold uppercase tracking-widest text-brand-ice/60">
                        <FaInstagram className="h-4 w-4 mr-2 text-pink-600" /> Instagram Profile
                      </Label>
                      <Input {...register('socialLinks.instagram')} placeholder="https://instagram.com/username" className="h-11 rounded-lg border-white/10 bg-transparent" />
                      {errors.socialLinks?.instagram && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.socialLinks.instagram.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center text-xs font-bold uppercase tracking-widest text-brand-ice/60">
                        <LinkIcon className="h-4 w-4 mr-2 text-brand-ice" /> TikTok Profile
                      </Label>
                      <Input {...register('socialLinks.tiktok')} placeholder="https://tiktok.com/@username" className="h-11 rounded-lg border-white/10 bg-transparent" />
                      {errors.socialLinks?.tiktok && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.socialLinks.tiktok.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center text-xs font-bold uppercase tracking-widest text-brand-ice/60">
                        <FaFacebookF className="h-4 w-4 mr-2 text-brand-cyan" /> Facebook Profile
                      </Label>
                      <Input {...register('socialLinks.facebook')} placeholder="https://facebook.com/username" className="h-11 rounded-lg border-white/10 bg-transparent" />
                      {errors.socialLinks?.facebook && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.socialLinks.facebook.message}</p>}
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            <DialogFooter className="p-8 pt-4 border-t bg-brand-navy">
              <div className="flex items-center justify-between w-full">
                <p className="text-[10px] font-bold text-brand-ice/60 uppercase tracking-widest">
                  {isEdit ? 'Last modified today' : 'Ready for AI processing'}
                </p>
                <div className="flex space-x-3">
                  <Button type="button" variant="outline" onClick={onClose} className="h-11 px-6 rounded-lg font-bold border-white/10">Cancel</Button>
                  <Button type="submit" className="h-11 px-8 rounded-lg bg-brand-electric hover:bg-brand-electric/80 shadow-none shadow-blue-100 font-bold transition-all active:scale-95" disabled={createMutation.isPending || updateMutation.isPending}>
                    {(createMutation.isPending || updateMutation.isPending) ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {isEdit ? 'Sync High-Value Record' : 'Onboard Patient'}
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
