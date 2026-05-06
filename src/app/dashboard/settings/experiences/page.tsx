"use client";

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
import AddExperienceForm from "@/components/AddExperienceForm";

export default function ExperiencesSettingsPage() {
  const organizationId = useAuthStore((state) => state.user?.organizationId);

  if (!organizationId) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center px-6 py-10">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Experiences</CardTitle>
            <CardDescription>
              You need to complete organization setup before you can add
              experiences.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Create or select an organization to start saving before and after
              stories.
            </p>
            <Button asChild>
              <Link href="/onboarding/create-organization">
                Set up workspace
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
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Settings / Experiences
        </p>
        <div className="max-w-3xl space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            Manage patient experiences
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            Add a new experience entry for the current organization. These
            stories can be reused across your marketing and clinic profile.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <AddExperienceForm organizationId={organizationId} />

        <Card className="h-fit border-slate-200 bg-slate-950 text-slate-50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-50">What to include</CardTitle>
            <CardDescription className="text-slate-300">
              Good entries make the AI and your team more useful.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-slate-300">
            <div>
              <p className="font-medium text-slate-50">Clear title</p>
              <p>
                Use a short headline that describes the transformation or
                outcome.
              </p>
            </div>
            <div>
              <p className="font-medium text-slate-50">Specific story</p>
              <p>
                Explain the patient context, treatment journey, and results in
                plain language.
              </p>
            </div>
            <div>
              <p className="font-medium text-slate-50">Useful imagery</p>
              <p>
                Provide valid before and after image URLs so the experience can
                be displayed consistently.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
