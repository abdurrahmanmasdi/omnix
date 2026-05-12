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
import { FaXTwitter } from "react-icons/fa6";

import { toast } from 'sonner';
import { CreateLeadDtoPriority } from '@/lib/api/model/createLeadDtoPriority';
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
    const data = sourcesData as any;
    if (Array.isArray(data)) return data;
    if (data?.items) return data.items;
    return [];
  }, [sourcesData]);

  // Fetch pipeline stages dynamically
  const { data: stagesData } = usePipelineStagesControllerFindAll({
    query: { enabled: isOpen }
  });
  const stages = useMemo(() => {
    const d = stagesData as any;
    const arr = Array.isArray(d) ? d : d?.items || d?.data || [];
    return [...arr].sort((a: any, b: any) => a.orderIndex - b.orderIndex);
  }, [stagesData]);

  // Default status: first pipeline stage name (or fallback)
  const defaultStatus = useMemo(() => {
    return stages.length > 0 ? stages[0].name : 'NEW';
  }, [stages]);

  // 2. Mutations
  const createMutation = useLeadsControllerCreate();
  const updateMutation = useLeadsControllerUpdate();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
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

  const statusValue = watch('status');
  const priorityValue = watch('priority');
  const currencyValue = watch('currency');
  const sourceIdValue = watch('sourceId');

  // Sync form with existing lead
  useEffect(() => {
    if (existingLead && isEdit) {
      const data = existingLead as any;
      reset({
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        country: data.country,
        email: data.email || '',
        status: data.status,
        priority: data.priority,
        currency: data.currency || CreateLeadDtoCurrency.USD,
        estimatedValue: data.estimatedValue || 0,
        timezone: data.timezone || 'UTC',
        primaryLanguage: data.primaryLanguage || 'en',
        expectedServiceDate: data.expectedServiceDate || '',
        sourceId: data.sourceId || 'none',
        socialLinks: {
          instagram: data.socialLinks?.instagram || '',
          tiktok: data.socialLinks?.tiktok || '',
          facebook: data.socialLinks?.facebook || '',
          twitter: data.socialLinks?.twitter || '',
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

  const onSubmit = (data: LeadFormData) => {
    const payload = { 
      ...data,
      sourceId: data.sourceId === 'none' ? undefined : data.sourceId,
    };
    
    if (isEdit && leadId) {
      updateMutation.mutate(
        { id: leadId, data: payload as any },
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
        { data: payload as any },
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
        <DialogHeader className="p-8 pb-4 bg-slate-50">
          <div className="flex items-center space-x-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <UserPlus size={20} />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-slate-900">{isEdit ? 'Update Prospect' : 'Onboard New Patient'}</DialogTitle>
              <DialogDescription className="text-slate-500 font-medium">
                {isEdit ? 'Refine patient details and clinical attribution.' : 'Enter new lead information to initiate AI qualification.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isFetching && isEdit ? (
          <div className="flex h-96 items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-hidden flex flex-col">
            <Tabs defaultValue="basic" className="flex-1 overflow-hidden flex flex-col">
              <div className="px-8 border-b bg-slate-50">
                <TabsList className="w-full justify-start bg-transparent h-14 p-0 space-x-8">
                  <TabsTrigger value="basic" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent shadow-none px-0 h-full text-sm font-bold uppercase tracking-widest text-slate-400 data-[state=active]:text-blue-600">
                    <Info className="h-4 w-4 mr-2" /> Basic Identity
                  </TabsTrigger>
                  <TabsTrigger value="attribution" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent shadow-none px-0 h-full text-sm font-bold uppercase tracking-widest text-slate-400 data-[state=active]:text-blue-600">
                    <Target className="h-4 w-4 mr-2" /> Attribution
                  </TabsTrigger>
                  <TabsTrigger value="social" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent shadow-none px-0 h-full text-sm font-bold uppercase tracking-widest text-slate-400 data-[state=active]:text-blue-600">
                    <FaInstagram className="h-4 w-4 mr-2" /> Social Presence
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                <TabsContent value="basic" className="mt-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="firstName" className="text-xs font-bold uppercase tracking-widest text-slate-500">First Name</Label>
                      <Input id="firstName" {...register('firstName')} placeholder="e.g. Ahmet" className="h-11 rounded-lg border-slate-200 focus:ring-blue-500/20" />
                      {errors.firstName && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.firstName.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName" className="text-xs font-bold uppercase tracking-widest text-slate-500">Last Name</Label>
                      <Input id="lastName" {...register('lastName')} placeholder="e.g. Yilmaz" className="h-11 rounded-lg border-slate-200 focus:ring-blue-500/20" />
                      {errors.lastName && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.lastName.message}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="phoneNumber" className="text-xs font-bold uppercase tracking-widest text-slate-500">Phone Number</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input id="phoneNumber" {...register('phoneNumber')} placeholder="+90 555..." className="pl-10 h-11 rounded-lg border-slate-200 focus:ring-blue-500/20" />
                      </div>
                      {errors.phoneNumber && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.phoneNumber.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-slate-500">Email Address</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input id="email" {...register('email')} placeholder="ahmet@example.com" className="pl-10 h-11 rounded-lg border-slate-200 focus:ring-blue-500/20" />
                      </div>
                      {errors.email && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.email.message}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="country" className="text-xs font-bold uppercase tracking-widest text-slate-500">Residence Country</Label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input id="country" {...register('country')} placeholder="e.g. Germany" className="pl-10 h-11 rounded-lg border-slate-200 focus:ring-blue-500/20" />
                      </div>
                      {errors.country && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.country.message}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Currency</Label>
                        <Select value={currencyValue} onValueChange={(val) => setValue('currency', val as CreateLeadDtoCurrency)}>
                          <SelectTrigger className="h-11 rounded-lg border-slate-200">
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
                        <Label htmlFor="estimatedValue" className="text-xs font-bold uppercase tracking-widest text-slate-500">Value</Label>
                        <Input id="estimatedValue" type="number" {...register('estimatedValue', { valueAsNumber: true })} className="h-11 rounded-lg border-slate-200" />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="attribution" className="mt-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Marketing Attribution Source</Label>
                    <Select value={sourceIdValue} onValueChange={(val) => setValue('sourceId', val)}>
                      <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white">
                        <SelectValue placeholder="Select how the patient found the clinic" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="font-medium">Direct Entry / Referral</SelectItem>
                        {sources.map((s: any) => (
                          <SelectItem key={s.id} value={s.id} className="font-medium">{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-slate-400 font-medium italic">Accurate source tracking improves AI conversion models.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-6 pt-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Lifecycle Status</Label>
                      <Select value={statusValue} onValueChange={(val) => setValue('status', val as any)}>
                        <SelectTrigger className="h-11 rounded-lg border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {stages.map((stage: any) => (
                            <SelectItem key={stage.id} value={stage.name}>{stage.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Sales Priority</Label>
                      <Select value={priorityValue} onValueChange={(val) => setValue('priority', val as CreateLeadDtoPriority)}>
                        <SelectTrigger className="h-11 rounded-lg border-slate-200">
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
                      <Label htmlFor="expectedServiceDate" className="text-xs font-bold uppercase tracking-widest text-slate-500">Expected Arrival Date</Label>
                      <Input id="expectedServiceDate" type="date" {...register('expectedServiceDate')} className="h-11 rounded-lg border-slate-200" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="primaryLanguage" className="text-xs font-bold uppercase tracking-widest text-slate-500">Patient Language</Label>
                      <Input id="primaryLanguage" {...register('primaryLanguage')} placeholder="e.g. Arabic, English" className="h-11 rounded-lg border-slate-200" />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="social" className="mt-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-5">
                    <div className="space-y-2">
                      <Label className="flex items-center text-xs font-bold uppercase tracking-widest text-slate-500">
                        <FaInstagram className="h-4 w-4 mr-2 text-pink-600" /> Instagram Profile
                      </Label>
                      <Input {...register('socialLinks.instagram')} placeholder="https://instagram.com/username" className="h-11 rounded-lg border-slate-200 bg-white" />
                      {errors.socialLinks?.instagram && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.socialLinks.instagram.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center text-xs font-bold uppercase tracking-widest text-slate-500">
                        <LinkIcon className="h-4 w-4 mr-2 text-slate-900" /> TikTok Profile
                      </Label>
                      <Input {...register('socialLinks.tiktok')} placeholder="https://tiktok.com/@username" className="h-11 rounded-lg border-slate-200 bg-white" />
                      {errors.socialLinks?.tiktok && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.socialLinks.tiktok.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center text-xs font-bold uppercase tracking-widest text-slate-500">
                        <FaFacebookF className="h-4 w-4 mr-2 text-blue-600" /> Facebook Profile
                      </Label>
                      <Input {...register('socialLinks.facebook')} placeholder="https://facebook.com/username" className="h-11 rounded-lg border-slate-200 bg-white" />
                      {errors.socialLinks?.facebook && <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.socialLinks.facebook.message}</p>}
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            <DialogFooter className="p-8 pt-4 border-t bg-slate-50">
              <div className="flex items-center justify-between w-full">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {isEdit ? 'Last modified today' : 'Ready for AI processing'}
                </p>
                <div className="flex space-x-3">
                  <Button type="button" variant="outline" onClick={onClose} className="h-11 px-6 rounded-lg font-bold border-slate-200">Cancel</Button>
                  <Button type="submit" className="h-11 px-8 rounded-lg bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-100 font-bold transition-all active:scale-95" disabled={createMutation.isPending || updateMutation.isPending}>
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
