"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Loader2, Save, Bot } from 'lucide-react';
import { useQueryClient } from "@tanstack/react-query";

import {
  useAiPersonaControllerGetPersona,
  useAiPersonaControllerUpsertPersona,
  getAiPersonaControllerGetPersonaQueryKey,
} from "@/lib/api/generated/ai-persona-settings/ai-persona-settings";
import type { UpsertAiPersonaDto } from "@/lib/api/model";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const formSchema = z.object({
  clinicName: z.string().min(2, {
    message: "Clinic name must be at least 2 characters.",
  }),
  agentName: z.string().min(1, {
    message: "Agent name is required.",
  }),
  tone: z.string({
    message: "Please select a tone for the AI agent.",
  }),
  handoffMessage: z.string().min(1, {
    message: "Handoff message is required.",
  }),
  businessRules: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function AiSettingsPage() {
  const queryClient = useQueryClient();

  // --- Orval-generated GET hook ---
  const { data: persona, isLoading: isFetching } = useAiPersonaControllerGetPersona({
    query: {
      // 404 is expected for new organizations that haven't configured a persona yet
      retry: (failureCount, error: { response?: { status?: number } }) => {
        if (error?.response?.status === 404) return false;
        return failureCount < 3;
      },
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clinicName: "",
      agentName: "Assistant",
      tone: "Professional and empathetic",
      handoffMessage: "I will transfer you to our medical coordinator.",
      businessRules: "",
    },
  });

  // Sync fetched data into the form
  useEffect(() => {
    if (persona) {
      const p = persona as { clinicName?: string; agentName?: string; tone?: string; handoffMessage?: string; businessRules?: string | Record<string, unknown> };
      let rulesText = "";
      if (typeof p.businessRules === 'string') {
        rulesText = p.businessRules;
      } else if (p.businessRules) {
        rulesText = JSON.stringify(p.businessRules, null, 2);
      }
      
      reset({
        clinicName: p.clinicName || "",
        agentName: p.agentName || "Assistant",
        tone: p.tone || "Professional and empathetic",
        handoffMessage: p.handoffMessage || "I will transfer you to our medical coordinator.",
        businessRules: rulesText,
      });
    }
  }, [persona, reset]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const toneValue = watch("tone");

  // --- Orval-generated POST mutation hook ---
  const mutation = useAiPersonaControllerUpsertPersona({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAiPersonaControllerGetPersonaQueryKey() });
        toast.success("AI Configuration saved!");
      },
      onError: (error) => {
        toast.error("Failed to save AI configuration.");
        console.error(error);
      },
    },
  });

  async function onSubmit(data: FormValues) {
    let parsedRules: Record<string, unknown> | undefined = undefined;
    if (data.businessRules && data.businessRules.trim()) {
      try {
        parsedRules = JSON.parse(data.businessRules);
      } catch {
        // If not valid JSON, wrap as a plain-text object the backend can store
        parsedRules = { _raw: data.businessRules };
      }
    }

    const payload: UpsertAiPersonaDto = {
      clinicName: data.clinicName,
      agentName: data.agentName,
      tone: data.tone,
      handoffMessage: data.handoffMessage,
      businessRules: parsedRules,
    };

    mutation.mutate({ data: payload });
  }

  return (
    <div className="p-8 max-w-3xl mx-auto animate-in fade-in duration-500">
      <Card className="shadow-2xl shadow-none border-white/10 rounded-2xl bg-transparent/80 backdrop-blur-xl overflow-hidden">
        <CardHeader className="bg-brand-navy border-b p-8 pb-6">
          <div className="flex items-center space-x-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-brand-electric flex items-center justify-center text-white shadow-lg shadow-brand-electric/20">
              <Bot size={20} />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-brand-ice">AI Agent Configuration</CardTitle>
              <CardDescription className="text-brand-ice/60 font-medium">
                Customize how your AI employee talks to patients.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-8">
          {isFetching ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-brand-cyan" />
              <p className="text-sm font-medium text-brand-ice/60">Loading AI configuration...</p>
            </div>
          ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="clinicName" className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">
                  Clinic Name
                </Label>
                <Input 
                  id="clinicName" 
                  {...register('clinicName')} 
                  placeholder="e.g. Smile Dental Clinic" 
                  className="h-11 rounded-lg border-white/10 focus:ring-blue-500/20" 
                />
                {errors.clinicName && (
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.clinicName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="agentName" className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">
                  Agent Name
                </Label>
                <Input 
                  id="agentName" 
                  {...register('agentName')} 
                  placeholder="e.g. Sarah" 
                  className="h-11 rounded-lg border-white/10 focus:ring-blue-500/20" 
                />
                {errors.agentName && (
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.agentName.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tone" className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">
                Agent Tone
              </Label>
              <Select 
                value={toneValue} 
                onValueChange={(val) => setValue('tone', val)}
              >
                <SelectTrigger id="tone" className="h-11 rounded-lg border-white/10">
                  <SelectValue placeholder="Select a tone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Professional and empathetic">Professional and empathetic</SelectItem>
                  <SelectItem value="Luxury and exclusive">Luxury and exclusive</SelectItem>
                  <SelectItem value="Friendly and casual">Friendly and casual</SelectItem>
                  <SelectItem value="Direct and clinical">Direct and clinical</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-brand-ice/60 font-medium italic mt-1">
                This dictates the style of language the AI will use with patients.
              </p>
              {errors.tone && (
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.tone.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="handoffMessage" className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">
                Handoff Message
              </Label>
              <Input 
                id="handoffMessage" 
                {...register('handoffMessage')} 
                placeholder="e.g. Let me transfer you to our human agent..." 
                className="h-11 rounded-lg border-white/10 focus:ring-blue-500/20" 
              />
              <p className="text-[10px] text-brand-ice/60 font-medium italic mt-1">
                The last message the AI will send before passing the chat to a human.
              </p>
              {errors.handoffMessage && (
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.handoffMessage.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessRules" className="text-xs font-bold uppercase tracking-widest text-brand-ice/60">
                Business Rules
              </Label>
              <Textarea 
                id="businessRules"
                {...register('businessRules')} 
                placeholder="e.g. If a patient asks about implants, require an X-ray before giving an exact price." 
                className="min-h-[120px] rounded-lg border-white/10 focus:ring-blue-500/20 resize-y"
              />
              <p className="text-[10px] text-brand-ice/60 font-medium italic mt-1">
                Specific instructions, rules, or JSON data to guide the AI&apos;s decision-making.
              </p>
              {errors.businessRules && (
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{errors.businessRules.message}</p>
              )}
            </div>

            <div className="pt-4 flex justify-end">
              <Button 
                type="submit" 
                disabled={mutation.isPending} 
                className="h-11 px-8 rounded-lg bg-brand-electric hover:bg-brand-electric/80 shadow-none shadow-blue-100 font-bold transition-all active:scale-95"
              >
                {mutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {mutation.isPending ? "Saving..." : "Save Configuration"}
              </Button>
            </div>
          </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
