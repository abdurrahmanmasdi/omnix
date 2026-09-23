"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Plug } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { axiosInstance } from "@/lib/api/axios-client";
import { useQueryClient } from "@tanstack/react-query";
import { useTenantQueryKey } from "@/hooks/useTenantQueryKey";

export default function IntegrationsSettingsPage() {
  const [token, setToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();
  const scopeKey = useTenantQueryKey();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) {
      toast.error("Please enter a HubSpot access token.");
      return;
    }

    setIsLoading(true);
    try {
      await axiosInstance.post("/channels", {
        provider: "HUBSPOT",
        accessToken: token.trim(),
        providerAccountId: "hubspot-oauth",
      });
      toast.success("HubSpot connected successfully.");
      setToken("");
      // Refresh channels so they appear
      queryClient.invalidateQueries({ queryKey: scopeKey(["/channels"]) });
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to connect HubSpot.");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto animate-in fade-in duration-500">
      <Card className="shadow-2xl shadow-none border-white/10 rounded-2xl bg-transparent/80 backdrop-blur-xl overflow-hidden">
        <CardHeader className="bg-brand-navy border-b p-8 pb-6">
          <div className="flex items-center space-x-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-brand-electric flex items-center justify-center text-white shadow-lg shadow-brand-electric/20">
              <Plug size={20} />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-brand-ice">
                Integrations
              </CardTitle>
              <CardDescription className="text-brand-ice/60 font-medium">
                Connect HubSpot to sync leads and deals.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-8">
          <form onSubmit={onSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label
                htmlFor="hubspotToken"
                className="text-xs font-bold uppercase tracking-widest text-brand-ice/60"
              >
                HubSpot Private App Access Token
              </Label>
              <Input
                id="hubspotToken"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="h-11 rounded-lg border-white/10 focus:ring-blue-500/20"
              />
              <p className="text-[10px] text-brand-ice/60 font-medium italic mt-1">
                Create a private app in HubSpot and paste its access token here.
                The token is verified immediately and stored encrypted at rest.
              </p>
            </div>

            <div className="pt-4 flex justify-end gap-3">
              <Button
                type="submit"
                disabled={isLoading}
                className="h-11 px-8 rounded-lg bg-brand-electric hover:bg-brand-electric/80 shadow-none shadow-blue-100 font-bold transition-all active:scale-95"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {isLoading ? "Saving..." : "Save Token"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
