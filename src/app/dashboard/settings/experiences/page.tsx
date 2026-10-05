"use client";
import { useCopy } from "@/i18n/copy";

import Link from "next/link";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ExperiencesTable from "@/components/ExperiencesTable";

export default function ExperiencesSettingsPage() {
  const copy = useCopy();

  const organizationId = useAuthStore((state) => state.user?.organizationId);

  if (!organizationId) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center px-6 py-10">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>{copy("Experiences")}</CardTitle>
            <CardDescription>
              {copy(
                "You need to complete organization setup before you can add experiences.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {copy(
                "Create or select an organization to start saving before and after stories.",
              )}
            </p>
            <Button asChild>
              <Link href="/onboarding/create-organization">
                {copy("Set up workspace")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-ice/60">
          {copy("Settings / Experiences")}
        </p>
        <div className="max-w-3xl space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            {copy("Manage patient experiences")}
          </h1>
          <p className="text-sm leading-6 text-brand-ice/60">
            {copy(
              "Add a new experience entry for the current organization. These stories can be reused across your marketing and clinic profile.",
            )}
          </p>
        </div>
      </div>

      <div className="">
        <ExperiencesTable />
      </div>
    </div>
  );
}
