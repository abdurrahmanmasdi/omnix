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

  const summary = (data as any) || {
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
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
          Welcome back, {user?.firstName}!
        </h1>
        <p className="text-slate-500 font-medium mt-1">
          Here is how your AI Agent is performing today.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Total Leads */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-blue-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-wide">
              Total Leads
            </CardTitle>
            <div className="h-8 w-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <Users className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">{summary.totalLeads.toLocaleString()}</div>
            <p className="text-xs font-medium text-slate-500 mt-1">Lifetime leads acquired</p>
          </CardContent>
        </Card>

        {/* Metric 2: Active AI Conversations */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-emerald-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-wide">
              Active AI Chats
            </CardTitle>
            <div className="h-8 w-8 bg-emerald-50 rounded-lg flex items-center justify-center">
              <Bot className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">{summary.activeConversations.toLocaleString()}</div>
            <p className="text-xs font-medium text-slate-500 mt-1">Ongoing automated conversations</p>
          </CardContent>
        </Card>

        {/* Metric 3: Needs Attention */}
        <Card className={`shadow-sm hover:shadow-md transition-shadow relative overflow-hidden ${
          hasNeedsAttention ? 'border-amber-300 bg-amber-50/30 ring-2 ring-amber-500/20' : 'border-slate-200'
        }`}>
          <div className={`absolute top-0 left-0 w-full h-1 ${hasNeedsAttention ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-slate-200 to-slate-300'}`} />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className={`text-sm font-bold uppercase tracking-wide ${hasNeedsAttention ? 'text-amber-700' : 'text-slate-600'}`}>
              Needs Attention
            </CardTitle>
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${hasNeedsAttention ? 'bg-amber-100' : 'bg-slate-100'}`}>
              <AlertCircle className={`h-4 w-4 ${hasNeedsAttention ? 'text-amber-600' : 'text-slate-400'}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-black ${hasNeedsAttention ? 'text-amber-600 animate-pulse' : 'text-slate-900'}`}>
              {summary.needsAttention.toLocaleString()}
            </div>
            <p className={`text-xs font-medium mt-1 ${hasNeedsAttention ? 'text-amber-700' : 'text-slate-500'}`}>
              Requires human intervention
            </p>
          </CardContent>
        </Card>

        {/* Metric 4: AI Conversion Rate */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-400 to-purple-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-wide">
              AI Conversion
            </CardTitle>
            <div className="h-8 w-8 bg-indigo-50 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-indigo-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">{summary.aiConversionRate}%</div>
            <p className="text-xs font-medium text-slate-500 mt-1">Leads progressed by AI</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Recent Lead Activity</h2>
          <Link href="/dashboard/leads">
            <Button variant="ghost" className="text-blue-600 font-bold hover:bg-blue-50">
              View All Leads
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>

        <Card className="border-slate-200 shadow-sm overflow-hidden">
          {summary.recentActivity.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center">
              <div className="h-12 w-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
                <Users className="h-6 w-6 text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">No recent lead activity.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {summary.recentActivity.map((activity: any) => {
                // Determine AI status UI mapping
                const isHandedOff = activity.status === 'HANDED_OFF';
                
                return (
                  <div key={activity.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    {/* Left: Lead Info */}
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 bg-slate-100 rounded-full flex flex-col items-center justify-center shrink-0 border border-slate-200">
                        <span className="text-xs font-black text-slate-600">
                          {activity.firstName?.[0] || 'U'}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">
                          {activity.firstName} {activity.lastName}
                        </h4>
                        <div className="flex items-center text-xs text-slate-500 font-medium mt-0.5">
                          <Phone className="h-3 w-3 mr-1" />
                          {activity.phoneNumber}
                        </div>
                      </div>
                    </div>

                    {/* Middle: Stage & AI Status */}
                    <div className="flex items-center gap-3">
                      {activity.pipelineStage && (
                        <Badge variant="secondary" className="bg-slate-100 text-slate-700 font-bold border-none uppercase tracking-wide text-[10px]">
                          {activity.pipelineStage.name}
                        </Badge>
                      )}
                      
                      {isHandedOff ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] uppercase font-bold tracking-wider">
                          Handed Off (Paused)
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] uppercase font-bold tracking-wider">
                          <Bot className="h-3 w-3 mr-1" />
                          AI Active
                        </Badge>
                      )}
                    </div>

                    {/* Right: Time */}
                    <div className="flex items-center text-xs text-slate-400 font-medium min-w-[100px] justify-end">
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
          <Card key={i} className="border-slate-100 shadow-sm">
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
        <Card className="border-slate-100 shadow-sm">
          <div className="divide-y divide-slate-100">
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