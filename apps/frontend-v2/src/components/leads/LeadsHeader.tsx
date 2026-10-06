"use client";
import { useCopy } from "@/i18n/copy";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus } from "lucide-react";

interface LeadsHeaderProps {
  onNewOnboarding: () => void;
}

export function LeadsHeader({ onNewOnboarding }: LeadsHeaderProps) {
  const copy = useCopy();

  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
      <div>
        <h1 className="text-3xl font-black text-brand-ice tracking-tight flex items-center">
          {copy("LEADS COMMAND CENTER")}
          <Badge
            variant="outline"
            className="ms-3 bg-brand-deep/30 text-brand-cyan border border-brand-electric/20 px-2 py-0 h-5 text-[10px] font-black tracking-tighter"
          >
            {copy("BETA")}
          </Badge>
        </h1>
        <p className="text-brand-ice/60 font-medium mt-1">
          {copy("AI-Powered Patient Pipeline for High-End Medical Clinics.")}
        </p>
      </div>
      <div className="flex items-center space-x-3">
        <Button
          className="bg-gradient-to-r from-brand-electric to-brand-violet hover:shadow-[0_0_15px_rgba(15,118,236,0.4)] text-white h-11 rounded-xl font-bold transition-all active:scale-95 border-none"
          onClick={onNewOnboarding}
        >
          <UserPlus className="me-2 h-4 w-4" />
          {copy("New Onboarding")}
        </Button>
      </div>
    </div>
  );
}
