"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createOrganizationSchema,
  type CreateOrganizationFormData,
} from "@/lib/validations/organization";
import { useAuthStore } from "@/store/auth-store";
import { useOrganizationsControllerCreateOrganization } from "@/lib/api/generated/organizations/organizations";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const setAuth = useAuthStore((state) => state.setAuth);
  const user = useAuthStore((state) => state.user);

  const form = useForm<CreateOrganizationFormData>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: "", slug: "", industry_category: "MEDICAL_TOURISM" },
  });

  const createOrgMutation = useOrganizationsControllerCreateOrganization();

  const onSubmit = (data: CreateOrganizationFormData) => {
    createOrgMutation.mutate(
      { data },
      {
        onSuccess: (response) => {
          toast.success("Workspace created successfully!");

          if (user) {
            setAuth(response.access_token, {
              ...user,
              organizationId: response.organizationId,
              hasCompletedOnboarding: true,
            });
          }

          // Welcome to the CRM!
          router.push("/dashboard");
        },
        onError: (error: any) => {
          toast.error(
            error.response?.data?.message || "Failed to create workspace",
          );
        },
      },
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>Name your Workspace</CardTitle>
          <CardDescription>
            Let's set up your clinic's CRM environment.
          </CardDescription>
        </CardHeader>

        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
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
