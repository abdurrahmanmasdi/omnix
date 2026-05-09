'use client';

import { useState, useMemo } from 'react';
import { useLeadsControllerFindOne, useLeadsControllerRemove } from '@/lib/api/generated/leads/leads';
import { useLeadSourcesControllerFindAll } from '@/lib/api/generated/lead-sources/lead-sources';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  User, 
  FileText, 
  Paperclip, 
  Loader2,
  Phone,
  Mail,
  Globe,
  Clock,
  Calendar,
  DollarSign,
  TrendingUp,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  Edit,
  Trash2,
  Video,
  Target
} from 'lucide-react';
import { FaInstagram, FaFacebookF } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { CreateLeadDtoStatus } from '@/lib/api/model/createLeadDtoStatus';
import { CreateLeadDtoPriority } from '@/lib/api/model/createLeadDtoPriority';

interface LeadDetailDrawerProps {
  leadId: string | null;
  onClose: () => void;
  onUpdate?: () => void;
  onEdit?: (id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  [CreateLeadDtoStatus.NEW]: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  [CreateLeadDtoStatus.QUALIFYING]: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  [CreateLeadDtoStatus.READY_TO_PAY]: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  [CreateLeadDtoStatus.HANDED_OFF]: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  [CreateLeadDtoStatus.UNQUALIFIED]: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
  [CreateLeadDtoStatus.WON]: 'bg-green-500/10 text-green-600 border-green-500/20',
  [CreateLeadDtoStatus.LOST]: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
};

const PRIORITY_COLORS: Record<string, string> = {
  [CreateLeadDtoPriority.HOT]: 'bg-red-500/10 text-red-600 border-red-500/20',
  [CreateLeadDtoPriority.WARM]: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  [CreateLeadDtoPriority.COLD]: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

export function LeadDetailDrawer({ leadId, onClose, onUpdate, onEdit }: LeadDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState('profile');

  // 1. Fetch lead details
  const { data: leadData, isLoading: isFetching } = useLeadsControllerFindOne(
    leadId as string,
    { query: { enabled: !!leadId } }
  );

  // 2. Fetch all lead sources to display name instead of ID
  const { data: sourcesData } = useLeadSourcesControllerFindAll({
    query: { enabled: !!leadId }
  });

  const lead = leadData as any;
  const sources = useMemo(() => {
    const data = sourcesData as any;
    if (Array.isArray(data)) return data;
    if (data?.items) return data.items;
    return [];
  }, [sourcesData]);

  const sourceName = useMemo(() => {
    if (!lead?.sourceId) return 'Direct / Referral';
    const source = sources.find((s: any) => s.id === lead.sourceId);
    return source?.name || 'Unknown Source';
  }, [lead?.sourceId, sources]);

  // 3. Mutations
  const deleteMutation = useLeadsControllerRemove();

  const handleDelete = () => {
    if (!leadId) return;
    if (confirm('Are you sure you want to delete this lead? This action cannot be undone.')) {
      deleteMutation.mutate(
        { id: leadId },
        {
          onSuccess: () => {
            toast.success('Lead deleted successfully');
            onClose();
            if (onUpdate) onUpdate();
          },
          onError: () => {
            toast.error('Failed to delete lead');
          }
        }
      );
    }
  };

  const initials = useMemo(() => {
    if (!lead) return '??';
    return `${lead.firstName?.[0] || ''}${lead.lastName?.[0] || ''}`.toUpperCase();
  }, [lead]);

  const relativeUpdateTime = useMemo(() => {
    if (!lead?.updatedAt) return '';
    try {
      return formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true });
    } catch {
      return 'just now';
    }
  }, [lead?.updatedAt]);

  return (
    <Sheet open={!!leadId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:!max-w-2xl overflow-y-auto p-0 border-l shadow-2xl">
        {isFetching ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          </div>
        ) : lead ? (
          <div className="flex flex-col h-full">
            {/* Enterprise Header */}
            <div className="bg-white p-6 border-b sticky top-0 z-10">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-5">
                  <Avatar className="h-16 w-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border-none shadow-xl transition-transform hover:scale-105 duration-300">
                    <AvatarFallback className="text-white text-xl font-bold bg-transparent">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 flex items-center">
                      {lead.firstName} {lead.lastName}
                      {lead.status === CreateLeadDtoStatus.WON && <ShieldCheck className="ml-2 h-5 w-5 text-emerald-500" />}
                    </h2>
                    <div className="flex items-center mt-1.5 space-x-2">
                      <Badge variant="outline" className={`${STATUS_COLORS[lead.status]} border px-2 py-0.5 text-[10px] font-bold tracking-wider`}>
                        {lead.status}
                      </Badge>
                      <Badge variant="outline" className={`${PRIORITY_COLORS[lead.priority]} border px-2 py-0.5 text-[10px] font-bold tracking-wider`}>
                        {lead.priority}
                      </Badge>
                      <span className="text-[10px] text-slate-400 font-black uppercase tracking-tighter ml-1">#LD-{lead.id.substring(0,8).toUpperCase()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm" className="h-9 px-3 border-slate-200 font-bold text-xs" onClick={() => onEdit?.(lead.id)}>
                    <Edit className="h-3.5 w-3.5 mr-2" />
                    REVISE
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" onClick={handleDelete}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Quick Contact Bar */}
              <div className="bg-slate-50 mt-6 rounded-xl border border-slate-100 p-4 shadow-inner">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-sm">
                      <Phone size={14} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Direct Line</p>
                      <a href={`tel:${lead.phoneNumber}`} className="text-sm font-black text-slate-900 hover:text-blue-600 transition-colors">
                        {lead.phoneNumber}
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-sm">
                      <Mail size={14} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Email Endpoint</p>
                      {lead.email ? (
                        <a href={`mailto:${lead.email}`} className="text-sm font-black text-slate-900 hover:text-blue-600 transition-colors">
                          {lead.email}
                        </a>
                      ) : (
                        <p className="text-sm font-bold text-slate-300 italic">No verified email</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 flex-1">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
                <TabsList className="w-full bg-slate-100/50 p-1 rounded-xl mb-6 border border-slate-100 shadow-inner">
                  <TabsTrigger value="profile" className="flex-1 rounded-lg py-2.5 text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-blue-600">
                    <User className="mr-2 h-3.5 w-3.5" /> Intelligence
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="flex-1 rounded-lg py-2.5 text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-blue-600">
                    <FileText className="mr-2 h-3.5 w-3.5" /> Audit Notes
                  </TabsTrigger>
                  <TabsTrigger value="attachments" className="flex-1 rounded-lg py-2.5 text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-blue-600">
                    <Paperclip className="mr-2 h-3.5 w-3.5" /> Clinical Files
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
                  <TabsContent value="profile" className="mt-0 space-y-8 animate-in fade-in duration-300">
                    {/* High Level Stats */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 flex flex-col items-center justify-center text-center shadow-sm">
                        <DollarSign className="h-5 w-5 text-emerald-600 mb-2" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Est. Value</span>
                        <span className="text-lg font-black text-slate-900">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: lead.currency || 'USD', maximumFractionDigits: 0 }).format(lead.estimatedValue || 0)}
                        </span>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 flex flex-col items-center justify-center text-center shadow-sm">
                        <Target className="h-5 w-5 text-blue-600 mb-2" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Attribution</span>
                        <span className="text-xs font-black text-slate-900 truncate max-w-full px-2 uppercase">{sourceName}</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 flex flex-col items-center justify-center text-center shadow-sm">
                        <MessageSquare className="h-5 w-5 text-purple-600 mb-2" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Activity</span>
                        <span className="text-xs font-black text-slate-900 uppercase">{relativeUpdateTime}</span>
                      </div>
                    </div>

                    {/* Detailed Information */}
                    <div className="space-y-6">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em]">Contextual Identity</h3>
                          <div className="flex space-x-2">
                            {lead.socialLinks?.instagram && <SocialIcon icon={<FaInstagram />} href={lead.socialLinks.instagram} color="text-pink-600" />}
                            {lead.socialLinks?.tiktok && <SocialIcon icon={<Video size={14} />} href={lead.socialLinks.tiktok} color="text-slate-900" />}
                            {lead.socialLinks?.facebook && <SocialIcon icon={<FaFacebookF />} href={lead.socialLinks.facebook} color="text-blue-600" />}
                            {lead.socialLinks?.twitter && <SocialIcon icon={<FaXTwitter />} href={lead.socialLinks.twitter} color="text-sky-500" />}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-y-6 gap-x-8 bg-slate-50/50 p-8 rounded-3xl border border-slate-100 shadow-inner">
                          <DataRow icon={<Globe size={14} />} label="Country of Residence" value={lead.country} />
                          <DataRow icon={<Clock size={14} />} label="Operational Timezone" value={lead.timezone || 'UTC+0'} />
                          <DataRow icon={<Calendar size={14} />} label="Expected Arrival" value={lead.expectedServiceDate || 'Not scheduled'} />
                          <DataRow icon={<Globe size={14} />} label="Primary Language" value={lead.primaryLanguage?.toUpperCase() || 'EN'} />
                        </div>
                      </div>

                      <Separator className="bg-slate-100" />

                      <div>
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-4">Clinic Pipeline</h3>
                        <div className="bg-slate-50/50 p-8 rounded-3xl border border-slate-100 shadow-inner grid grid-cols-2 gap-y-6 gap-x-8">
                          <DataRow icon={<User size={14} />} label="Assigned Sales Agent" value={lead.assignedAgentId || 'AI DIGITAL ASSISTANT'} />
                          <DataRow icon={<TrendingUp size={14} />} label="Last Interaction Audit" value={new Date(lead.updatedAt).toLocaleDateString()} />
                        </div>
                      </div>
                    </div>

                    <div className="pt-4">
                      <Button className="w-full h-14 bg-slate-900 hover:bg-black text-white shadow-2xl rounded-2xl font-black uppercase tracking-widest transition-all active:scale-[0.98]">
                        Intercept AI Conversation
                        <ExternalLink className="ml-3 h-4 w-4" />
                      </Button>
                      <p className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest mt-4 italic opacity-60">Manual override will pause the autonomous agent.</p>
                    </div>
                  </TabsContent>

                  <TabsContent value="notes" className="space-y-6 animate-in fade-in duration-300">
                    <div className="space-y-4">
                      <div className="relative group">
                        <Textarea 
                          placeholder="Log a clinical or sales observation..." 
                          className="min-h-[160px] rounded-3xl border-slate-200 focus:ring-blue-500/10 shadow-sm resize-none p-6 text-sm font-medium leading-relaxed transition-all group-hover:border-slate-300" 
                        />
                        <Button size="sm" className="absolute bottom-4 right-4 bg-blue-600 hover:bg-blue-700 h-10 px-6 rounded-xl shadow-xl shadow-blue-200 font-black text-[10px] uppercase tracking-widest">
                          COMMIT NOTE
                        </Button>
                      </div>

                      <div className="space-y-4 mt-8">
                        <div className="p-6 bg-blue-50/30 border border-blue-100 rounded-3xl relative shadow-sm">
                          <div className="flex items-center mb-4">
                            <Avatar className="h-8 w-8 mr-3 border-2 border-white shadow-md">
                              <AvatarFallback className="bg-blue-600 text-[10px] text-white font-black">AI</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Digital Sales Assistant</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase">System Log • 12:45 PM</p>
                            </div>
                          </div>
                          <p className="text-sm text-slate-700 leading-relaxed font-medium">
                            Patient is concerned about the recovery time for a full-arch dental implant. I provided the "7-day recovery protocol" PDF and mentioned our 5-year clinical guarantee. The lead is now in `READY_TO_PAY` status.
                          </p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="attachments" className="animate-in fade-in duration-300">
                    <div className="grid grid-cols-1 gap-4">
                      <div className="border-2 border-dashed border-slate-200 rounded-[2.5rem] p-16 flex flex-col items-center justify-center space-y-6 bg-slate-50/50 hover:bg-slate-50 hover:border-blue-300 transition-all cursor-pointer group">
                        <div className="p-6 bg-white shadow-xl border border-slate-100 rounded-3xl text-blue-600 group-hover:scale-110 duration-300 transition-transform">
                          <Paperclip size={40} />
                        </div>
                        <div className="text-center">
                          <p className="font-black text-sm text-slate-900 uppercase tracking-widest">Secure File Vault</p>
                          <p className="text-xs text-slate-400 mt-2 max-w-[240px] font-medium leading-relaxed">Upload medical X-Rays, Scans, or Identity Passports for clinical review.</p>
                        </div>
                        <Button variant="outline" size="sm" className="bg-white border-slate-200 rounded-xl h-10 px-8 font-black text-[10px] uppercase tracking-[0.2em] shadow-sm hover:bg-slate-50">ACCESS LOCAL DISK</Button>
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400 font-black text-xs uppercase tracking-[0.3em]">
            Record Not Found
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DataRow({ icon, label, value, isLink = false }: { icon: React.ReactNode, label: string, value: string, isLink?: boolean }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
        <span className="mr-2 text-slate-300">{icon}</span>
        {label}
      </div>
      <div className={`text-[13px] font-black truncate leading-none ${isLink ? 'text-blue-600 cursor-pointer hover:underline' : 'text-slate-900'}`}>
        {value?.toUpperCase()}
      </div>
    </div>
  );
}

function SocialIcon({ icon, href, color }: { icon: React.ReactNode, href: string, color: string }) {
  return (
    <a 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer" 
      className={`h-9 w-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center ${color} hover:bg-slate-50 hover:scale-110 transition-all shadow-md hover:shadow-lg duration-300`}
    >
      {icon}
    </a>
  );
}
