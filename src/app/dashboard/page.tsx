'use client';

import { useAuthStore } from '@/store/auth-store';
import { useAnalyticsControllerGetSummary } from '@/lib/api/generated/analytics/analytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { 
  Users, 
  Bot, 
  AlertCircle, 
  TrendingUp,
  Clock,
  ArrowRight,
  Phone
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  
  // Refetch frequently on dashboard
  const { data, isLoading } = useAnalyticsControllerGetSummary({
    query: {
      refetchInterval: 30000,
    }
  });

  const summary = (data as { totalLeads: number; activeConversations: number; needsAttention: number; aiConversionRate: number; recentActivity: { id: string; status: string; firstName?: string; lastName?: string; phoneNumber?: string; pipelineStage?: { name: string }; updatedAt: string }[] }) || {
    totalLeads: 0,
    activeConversations: 0,
    needsAttention: 0,
    aiConversionRate: 0,
    recentActivity: [],
  };

  const hasNeedsAttention = summary.needsAttention > 0;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-brand-ice tracking-tight">
          Welcome back, {user?.firstName}!
        </h1>
        <p className="text-brand-ice/60 font-medium mt-1">
          Clinic workspace totals and recent activity.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Total Leads */}
        <Card className="border-white/10 shadow-none hover:shadow-none transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-blue-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold text-brand-ice/60 uppercase tracking-wide">
              Total Leads
            </CardTitle>
            <div className="h-8 w-8 bg-brand-electric/10 rounded-lg flex items-center justify-center">
              <Users className="h-4 w-4 text-brand-cyan" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-brand-ice">{summary.totalLeads.toLocaleString()}</div>
            <p className="text-xs font-medium text-brand-ice/60 mt-1">Total patient enquiries</p>
          </CardContent>
        </Card>

        {/* Metric 2: Active AI Conversations */}
        <Card className="border-white/10 shadow-none hover:shadow-none transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-emerald-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold text-brand-ice/60 uppercase tracking-wide">
              Active AI Chats
            </CardTitle>
            <div className="h-8 w-8 bg-brand-cyan/10 rounded-lg flex items-center justify-center">
              <Bot className="h-4 w-4 text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-brand-ice">{summary.activeConversations.toLocaleString()}</div>
            <p className="text-xs font-medium text-brand-ice/60 mt-1">Ongoing automated conversations</p>
          </CardContent>
        </Card>

        {/* Metric 3: Needs Attention */}
        <Card className={`shadow-none hover:shadow-none transition-shadow relative overflow-hidden ${
          hasNeedsAttention ? 'border-amber-500/30 bg-amber-500/200/10 ring-2 ring-amber-500/20' : 'border-white/10'
        }`}>
          <div className={`absolute top-0 left-0 w-full h-1 ${hasNeedsAttention ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-brand-electric to-brand-violet'}`} />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className={`text-sm font-bold uppercase tracking-wide ${hasNeedsAttention ? 'text-amber-400' : 'text-brand-ice/60'}`}>
              Needs Attention
            </CardTitle>
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${hasNeedsAttention ? 'bg-amber-500/20' : 'bg-[#01081A]'}`}>
              <AlertCircle className={`h-4 w-4 ${hasNeedsAttention ? 'text-amber-400' : 'text-brand-ice/60'}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-black ${hasNeedsAttention ? 'text-amber-400 animate-pulse' : 'text-brand-ice'}`}>
              {summary.needsAttention.toLocaleString()}
            </div>
            <p className={`text-xs font-medium mt-1 ${hasNeedsAttention ? 'text-amber-400' : 'text-brand-ice/60'}`}>
              Requires human intervention
            </p>
          </CardContent>
        </Card>

        {/* Share of leads in READY_TO_BOOK or WON pipeline status. */}
        <Card className="border-white/10 shadow-none hover:shadow-none transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-400 to-purple-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold text-brand-ice/60 uppercase tracking-wide">
              Pipeline progress
            </CardTitle>
            <div className="h-8 w-8 bg-brand-electric/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-indigo-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-brand-ice">{summary.aiConversionRate}%</div>
            <p className="text-xs font-medium text-brand-ice/60 mt-1">Ready to book or won; not confirmed revenue</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-brand-ice tracking-tight">Recent Lead Activity</h2>
          <Link href="/dashboard/leads">
            <Button variant="ghost" className="text-brand-cyan font-bold hover:bg-brand-electric/10">
              View All Leads
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>

        <Card className="border-white/10 shadow-none overflow-hidden">
          {summary.recentActivity.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center">
              <div className="h-12 w-12 bg-[#051126] rounded-2xl flex items-center justify-center mb-4 border border-white/10">
                <Users className="h-6 w-6 text-brand-ice/40" />
              </div>
              <p className="text-brand-ice/60 font-medium">No recent lead activity.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {summary.recentActivity.map((activity: { id: string; status: string; firstName?: string; lastName?: string; phoneNumber?: string; pipelineStage?: { name: string }; updatedAt: string }) => {
                // Determine AI status UI mapping
                const isHandedOff = activity.status === 'HANDED_OFF';
                
                return (
                  <div key={activity.id} className="p-4 flex items-center justify-between hover:bg-[#051126] transition-colors">
                    {/* Left: Lead Info */}
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 bg-[#01081A] rounded-full flex flex-col items-center justify-center shrink-0 border border-white/10">
                        <span className="text-xs font-black text-brand-ice/60">
                          {activity.firstName?.[0] || 'U'}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-bold text-brand-ice text-sm">
                          {activity.firstName} {activity.lastName}
                        </h4>
                        <div className="flex items-center text-xs text-brand-ice/60 font-medium mt-0.5">
                          <Phone className="h-3 w-3 mr-1" />
                          {activity.phoneNumber}
                        </div>
                      </div>
                    </div>

                    {/* Middle: Stage & AI Status */}
                    <div className="flex items-center gap-3">
                      {activity.pipelineStage && (
                        <Badge variant="secondary" className="bg-[#01081A] text-brand-ice/80 font-bold border-none uppercase tracking-wide text-[10px]">
                          {activity.pipelineStage.name}
                        </Badge>
                      )}
                      
                      {isHandedOff ? (
                        <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/20 text-[10px] uppercase font-bold tracking-wider">
                          Handed Off (Paused)
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20 text-[10px] uppercase font-bold tracking-wider">
                          <Bot className="h-3 w-3 mr-1" />
                          AI Active
                        </Badge>
                      )}
                    </div>

                    {/* Right: Time */}
                    <div className="flex items-center text-xs text-brand-ice/60 font-medium min-w-[100px] justify-end">
                      <Clock className="h-3 w-3 mr-1.5" />
                      {formatDistanceToNow(new Date(activity.updatedAt), { addSuffix: true })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      {/* Header Skeleton */}
      <div>
        <Skeleton className="h-10 w-[300px] mb-2" />
        <Skeleton className="h-5 w-[400px]" />
      </div>

      {/* Metrics Row Skeleton */}
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-white/10 shadow-none">
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-16 mb-2" />
              <Skeleton className="h-4 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity Skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Card className="border-white/10 shadow-none">
          <div className="divide-y divide-white/5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
