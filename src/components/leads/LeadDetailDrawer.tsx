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
  [CreateLeadDtoStatus.NEW]: 'bg-brand-electric/100/10 text-brand-cyan border-blue-500/20',
  [CreateLeadDtoStatus.QUALIFYING]: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  [CreateLeadDtoStatus.READY_TO_PAY]: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  [CreateLeadDtoStatus.HANDED_OFF]: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  [CreateLeadDtoStatus.UNQUALIFIED]: 'bg-transparent/10 text-brand-ice/60 border-white/20',
  [CreateLeadDtoStatus.WON]: 'bg-green-500/10 text-green-600 border-green-500/20',
  [CreateLeadDtoStatus.LOST]: 'bg-rose-500/100/10 text-rose-600 border-rose-500/20',
};

const PRIORITY_COLORS: Record<string, string> = {
  [CreateLeadDtoPriority.HOT]: 'bg-red-500/10 text-red-400 border-red-500/20',
  [CreateLeadDtoPriority.WARM]: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  [CreateLeadDtoPriority.COLD]: 'bg-brand-electric/100/10 text-brand-cyan border-blue-500/20',
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
            <Loader2 className="h-10 w-10 animate-spin text-brand-cyan" />
          </div>
        ) : lead ? (
          <div className="flex flex-col h-full">
            {/* Enterprise Header */}
            <div className="bg-[#051126] p-6 border-b border-white/10 sticky top-0 z-10">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-5">
                  <Avatar className="h-16 w-16 rounded-2xl bg-gradient-to-br from-brand-electric to-brand-violet border-none shadow-none transition-transform hover:scale-105 duration-300">
                    <AvatarFallback className="text-white text-xl font-bold bg-transparent">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-2xl font-bold text-brand-ice flex items-center">
                      {lead.firstName} {lead.lastName}
                      {lead.status === CreateLeadDtoStatus.WON && <ShieldCheck className="ml-2 h-5 w-5 text-brand-cyan" />}
                    </h2>
                    <div className="flex items-center mt-1.5 space-x-2">
                      <Badge variant="outline" className={`${STATUS_COLORS[lead.status]} border px-2 py-0.5 text-[10px] font-bold tracking-wider`}>
                        {lead.status}
                      </Badge>
                      <Badge variant="outline" className={`${PRIORITY_COLORS[lead.priority]} border px-2 py-0.5 text-[10px] font-bold tracking-wider`}>
                        {lead.priority}
                      </Badge>
                      <span className="text-[10px] text-brand-ice/60 font-black uppercase tracking-tighter ml-1">#LD-{lead.id.substring(0,8).toUpperCase()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm" className="h-9 px-3 border-white/10 font-bold text-xs" onClick={() => onEdit?.(lead.id)}>
                    <Edit className="h-3.5 w-3.5 mr-2" />
                    REVISE
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-brand-ice/60 hover:text-red-500 hover:bg-red-500/10 transition-colors" onClick={handleDelete}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Quick Contact Bar */}
              <div className="bg-brand-navy mt-6 rounded-xl border border-white/10 p-4 shadow-inner">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-lg bg-[#01081A] border border-white/10 flex items-center justify-center text-brand-ice/60 shadow-none">
                      <Phone size={14} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-brand-ice/60 uppercase tracking-[0.15em]">Direct Line</p>
                      <a href={`tel:${lead.phoneNumber}`} className="text-sm font-black text-brand-ice hover:text-brand-cyan transition-colors">
                        {lead.phoneNumber}
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-lg bg-[#01081A] border border-white/10 flex items-center justify-center text-brand-ice/60 shadow-none">
                      <Mail size={14} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-brand-ice/60 uppercase tracking-[0.15em]">Email Endpoint</p>
                      {lead.email ? (
                        <a href={`mailto:${lead.email}`} className="text-sm font-black text-brand-ice hover:text-brand-cyan transition-colors">
                          {lead.email}
                        </a>
                      ) : (
                        <p className="text-sm font-bold text-brand-ice/40 italic">No verified email</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 flex-1">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
                <TabsList className="w-full bg-brand-deep/50 p-1 rounded-xl mb-6 border border-white/10 shadow-inner">
                  <TabsTrigger value="profile" className="flex-1 rounded-lg py-2.5 text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-brand-navy data-[state=active]:shadow-none data-[state=active]:text-brand-cyan">
                    <User className="mr-2 h-3.5 w-3.5" /> Intelligence
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="flex-1 rounded-lg py-2.5 text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-brand-navy data-[state=active]:shadow-none data-[state=active]:text-brand-cyan">
                    <FileText className="mr-2 h-3.5 w-3.5" /> Audit Notes
                  </TabsTrigger>
                  <TabsTrigger value="attachments" className="flex-1 rounded-lg py-2.5 text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-brand-navy data-[state=active]:shadow-none data-[state=active]:text-brand-cyan">
                    <Paperclip className="mr-2 h-3.5 w-3.5" /> Clinical Files
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
                  <TabsContent value="profile" className="mt-0 space-y-8 animate-in fade-in duration-300">
                    {/* High Level Stats */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-brand-navy border border-white/10 rounded-2xl p-5 flex flex-col items-center justify-center text-center shadow-none">
                        <DollarSign className="h-5 w-5 text-emerald-400 mb-2" />
                        <span className="text-[10px] font-black text-brand-ice/60 uppercase tracking-widest">Est. Value</span>
                        <span className="text-lg font-black text-brand-ice">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: lead.currency || 'USD', maximumFractionDigits: 0 }).format(lead.estimatedValue || 0)}
                        </span>
                      </div>
                      <div className="bg-brand-navy border border-white/10 rounded-2xl p-5 flex flex-col items-center justify-center text-center shadow-none">
                        <Target className="h-5 w-5 text-brand-cyan mb-2" />
                        <span className="text-[10px] font-black text-brand-ice/60 uppercase tracking-widest">Attribution</span>
                        <span className="text-xs font-black text-brand-ice truncate max-w-full px-2 uppercase">{sourceName}</span>
                      </div>
                      <div className="bg-brand-navy border border-white/10 rounded-2xl p-5 flex flex-col items-center justify-center text-center shadow-none">
                        <MessageSquare className="h-5 w-5 text-purple-600 mb-2" />
                        <span className="text-[10px] font-black text-brand-ice/60 uppercase tracking-widest">Activity</span>
                        <span className="text-xs font-black text-brand-ice uppercase">{relativeUpdateTime}</span>
                      </div>
                    </div>

                    {/* Detailed Information */}
                    <div className="space-y-6">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xs font-black text-brand-ice uppercase tracking-[0.2em]">Contextual Identity</h3>
                          <div className="flex space-x-2">
                            {lead.socialLinks?.instagram && <SocialIcon icon={<FaInstagram />} href={lead.socialLinks.instagram} color="text-pink-600" />}
                            {lead.socialLinks?.tiktok && <SocialIcon icon={<Video size={14} />} href={lead.socialLinks.tiktok} color="text-brand-ice" />}
                            {lead.socialLinks?.facebook && <SocialIcon icon={<FaFacebookF />} href={lead.socialLinks.facebook} color="text-brand-cyan" />}
                            {lead.socialLinks?.twitter && <SocialIcon icon={<FaXTwitter />} href={lead.socialLinks.twitter} color="text-sky-500" />}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-y-6 gap-x-8 bg-brand-navy/50 p-8 rounded-3xl border border-white/10 shadow-inner">
                          <DataRow icon={<Globe size={14} />} label="Country of Residence" value={lead.country} />
                          <DataRow icon={<Clock size={14} />} label="Operational Timezone" value={lead.timezone || 'UTC+0'} />
                          <DataRow icon={<Calendar size={14} />} label="Expected Arrival" value={lead.expectedServiceDate || 'Not scheduled'} />
                          <DataRow icon={<Globe size={14} />} label="Primary Language" value={lead.primaryLanguage?.toUpperCase() || 'EN'} />
                        </div>
                      </div>

                      <Separator className="bg-brand-deep" />

                      <div>
                        <h3 className="text-xs font-black text-brand-ice uppercase tracking-[0.2em] mb-4">Clinic Pipeline</h3>
                        <div className="bg-brand-navy/50 p-8 rounded-3xl border border-white/10 shadow-inner grid grid-cols-2 gap-y-6 gap-x-8">
                          <DataRow icon={<User size={14} />} label="Assigned Sales Agent" value={lead.assignedAgentId || 'AI DIGITAL ASSISTANT'} />
                          <DataRow icon={<TrendingUp size={14} />} label="Last Interaction Audit" value={new Date(lead.updatedAt).toLocaleDateString()} />
                        </div>
                      </div>
                    </div>

                    <div className="pt-4">
                      <Button className="w-full h-14 bg-brand-deep hover:bg-black text-white shadow-2xl rounded-2xl font-black uppercase tracking-widest transition-all active:scale-[0.98]">
                        Intercept AI Conversation
                        <ExternalLink className="ml-3 h-4 w-4" />
                      </Button>
                      <p className="text-[10px] text-center text-brand-ice/60 font-bold uppercase tracking-widest mt-4 italic opacity-60">Manual override will pause the autonomous agent.</p>
                    </div>
                  </TabsContent>

                  <TabsContent value="notes" className="space-y-6 animate-in fade-in duration-300">
                    <div className="space-y-4">
                      <div className="relative group">
                        <Textarea 
                          placeholder="Log a clinical or sales observation..." 
                          className="min-h-[160px] rounded-3xl border-white/10 focus:ring-blue-500/10 shadow-none resize-none p-6 text-sm font-medium leading-relaxed transition-all group-hover:border-brand-electric/50" 
                        />
                        <Button size="sm" className="absolute bottom-4 right-4 bg-brand-electric hover:bg-brand-electric/80 h-10 px-6 rounded-xl shadow-none shadow-brand-electric/20 font-black text-[10px] uppercase tracking-widest">
                          COMMIT NOTE
                        </Button>
                      </div>

                      <div className="space-y-4 mt-8">
                        <div className="p-6 bg-brand-electric/10/30 border border-brand-electric/30 rounded-3xl relative shadow-none">
                          <div className="flex items-center mb-4">
                            <Avatar className="h-8 w-8 mr-3 border-2 border-white shadow-none">
                              <AvatarFallback className="bg-brand-electric text-[10px] text-white font-black">AI</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-[10px] font-black text-brand-ice uppercase tracking-widest">Digital Sales Assistant</p>
                              <p className="text-[10px] font-bold text-brand-ice/60 uppercase">System Log • 12:45 PM</p>
                            </div>
                          </div>
                          <p className="text-sm text-brand-ice/80 leading-relaxed font-medium">
                            Patient is concerned about the recovery time for a full-arch dental implant. I provided the "7-day recovery protocol" PDF and mentioned our 5-year clinical guarantee. The lead is now in `READY_TO_PAY` status.
                          </p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="attachments" className="animate-in fade-in duration-300">
                    <div className="grid grid-cols-1 gap-4">
                      <div className="border-2 border-dashed border-white/10 rounded-[2.5rem] p-16 flex flex-col items-center justify-center space-y-6 bg-brand-navy/50 hover:bg-brand-navy hover:border-brand-electric/30 transition-all cursor-pointer group">
                        <div className="p-6 bg-transparent shadow-none border border-white/10 rounded-3xl text-brand-cyan group-hover:scale-110 duration-300 transition-transform">
                          <Paperclip size={40} />
                        </div>
                        <div className="text-center">
                          <p className="font-black text-sm text-brand-ice uppercase tracking-widest">Secure File Vault</p>
                          <p className="text-xs text-brand-ice/60 mt-2 max-w-[240px] font-medium leading-relaxed">Upload medical X-Rays, Scans, or Identity Passports for clinical review.</p>
                        </div>
                        <Button variant="outline" size="sm" className="bg-transparent border-white/10 rounded-xl h-10 px-8 font-black text-[10px] uppercase tracking-[0.2em] shadow-none hover:bg-brand-navy">ACCESS LOCAL DISK</Button>
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-brand-ice/60 font-black text-xs uppercase tracking-[0.3em]">
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
      <div className="flex items-center text-[10px] font-black text-brand-ice/60 uppercase tracking-[0.15em]">
        <span className="mr-2 text-brand-ice/40">{icon}</span>
        {label}
      </div>
      <div className={`text-[13px] font-black truncate leading-none ${isLink ? 'text-brand-cyan cursor-pointer hover:underline' : 'text-brand-ice'}`}>
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
      className={`h-9 w-9 rounded-xl bg-[#01081A] border border-white/10 flex items-center justify-center ${color} hover:bg-brand-navy hover:scale-110 transition-all shadow-none hover:shadow-lg duration-300`}
    >
      {icon}
    </a>
  );
}
