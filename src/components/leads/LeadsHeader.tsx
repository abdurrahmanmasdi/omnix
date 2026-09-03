'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserPlus } from 'lucide-react';

interface LeadsHeaderProps {
  onNewOnboarding: () => void;
}

export function LeadsHeader({ onNewOnboarding }: LeadsHeaderProps) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center">
          LEADS COMMAND CENTER
          <Badge variant="outline" className="ml-3 bg-blue-600 text-white border-none px-2 py-0 h-5 text-[10px] font-black tracking-tighter">BETA</Badge>
        </h1>
        <p className="text-slate-500 font-medium mt-1">AI-Powered Patient Pipeline for High-End Medical Clinics.</p>
      </div>
      <div className="flex items-center space-x-3">
        <Button 
          className="bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-200 h-11 rounded-xl font-bold transition-all active:scale-95" 
          onClick={onNewOnboarding}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          New Onboarding
        </Button>
      </div>
    </div>
  );
}
