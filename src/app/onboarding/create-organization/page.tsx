"use client";

import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Plus, Trash2 } from "lucide-react";
import {
  createOrganizationSchema,
  type CreateOrganizationFormData,
} from "@/lib/validations/organization";
import { useAuthStore } from "@/store/auth-store";
import { installSession } from "@/lib/session-manager";
import { useOrganizationsControllerCreateOrganization } from "@/lib/api/generated/organizations/organizations";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function CreateOrganizationPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const form = useForm<CreateOrganizationFormData>({
    resolver: zodResolver(createOrganizationSchema) as never,
    defaultValues: { 
      name: "", 
      slug: "", 
      agentTone: "Professional & Empathetic",
      businessRules: [{ rule: "" }],
      industry_category: "MEDICAL_TOURISM" 
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "businessRules",
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const name = form.watch("name");
  const isSlugDirty = form.formState.dirtyFields.slug;

  useEffect(() => {
    if (name && !isSlugDirty) {
      const generatedSlug = name
        .toLowerCase()
        .trim()
        .replace(/[\s_]+/g, '-')
        .replace(/[^\w-]+/g, '');
      form.setValue("slug", generatedSlug, { shouldValidate: true });
    }
  }, [name, isSlugDirty, form]);

  const createOrgMutation = useOrganizationsControllerCreateOrganization();

  const onSubmit = (data: CreateOrganizationFormData) => {
    const finalRules = data.businessRules
      ? data.businessRules.map(r => r.rule.trim()).filter(Boolean)
      : [];

    const payload = {
      name: data.name,
      slug: data.slug,
      industry_category: data.industry_category,
      agentTone: data.agentTone,
      businessRules: { rules: finalRules },
    };

    createOrgMutation.mutate(
      { data: payload as never },
      {
        onSuccess: (response) => {
          toast.success("Workspace created successfully!");

          if (user) {
            installSession(response.access_token, {
              ...user,
              organizationId: response.organizationId,
              hasCompletedOnboarding: true,
            });
          }

          // Welcome to the CRM!
          router.push("/dashboard");
        },
        onError: (error: unknown) => {
          const err = error as { response?: { data?: { message?: string } } };
          toast.error(
            err.response?.data?.message || "Failed to create workspace",
          );
        },
      },
    );
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <div className="mb-8 flex items-center justify-center space-x-3 text-slate-800">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
          <Building2 size={24} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">OmniDesk</h1>
      </div>

      <Card className="w-full max-w-xl shadow-lg">
        <CardHeader>
          <CardTitle>Name your Workspace</CardTitle>
          <CardDescription>
            Let&apos;s set up your clinic&apos;s AI Sales Agent and CRM environment.
          </CardDescription>
        </CardHeader>

        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Clinic Name</Label>
                <Input
                  id="name"
                  placeholder="Istanbul Premium Hair"
                  {...form.register("name")}
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Workspace URL Slug</Label>
                <Input
                  id="slug"
                  placeholder="istanbul-premium-hair"
                  {...form.register("slug")}
                />
                {form.formState.errors.slug && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.slug.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agentTone">AI Agent Tone</Label>
              <Select
                onValueChange={(value) => form.setValue("agentTone", value, { shouldValidate: true })}
                defaultValue={form.getValues("agentTone")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a tone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Professional & Empathetic">Professional & Empathetic</SelectItem>
                  <SelectItem value="Luxury & Exclusive">Luxury & Exclusive</SelectItem>
                  <SelectItem value="Friendly & Casual">Friendly & Casual</SelectItem>
                  <SelectItem value="Direct & Clinical">Direct & Clinical</SelectItem>
                </SelectContent>
              </Select>
              {form.formState.errors.agentTone && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.agentTone.message}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Business Rules</Label>
              </div>
              <p className="text-xs text-slate-500 pb-1">
                Define the guidelines your AI Agent must follow when chatting with patients.
              </p>
              
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-start space-x-2">
                    <div className="flex-1 space-y-1">
                      <Input
                        placeholder="e.g. Never quote an exact price before a consultation."
                        {...form.register(`businessRules.${index}.rule` as const)}
                      />
                      {form.formState.errors.businessRules?.[index]?.rule && (
                        <p className="text-sm text-red-500">
                          {form.formState.errors.businessRules[index]?.rule?.message}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-slate-400 hover:text-red-500 hover:bg-red-500/10"
                      onClick={() => remove(index)}
                    >
                      <Trash2 size={18} />
                      <span className="sr-only">Remove rule</span>
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={() => append({ rule: "" })}
              >
                <Plus size={16} className="mr-2" />
                Add Rule
              </Button>
              {form.formState.errors.businessRules && !Array.isArray(form.formState.errors.businessRules) && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.businessRules.message}
                </p>
              )}
            </div>
          </CardContent>

          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={createOrgMutation.isPending}
            >
              {createOrgMutation.isPending ? "Creating..." : "Create Workspace"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
