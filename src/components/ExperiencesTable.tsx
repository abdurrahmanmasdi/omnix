"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import type { CreateExperienceDto, UpdateExperienceDto } from "@/lib/api/model";
import {
  getExperiencesControllerGetExperiencesQueryKey,
  useExperiencesControllerCreateExperience,
  useExperiencesControllerGetExperiences,
  useExperiencesControllerRemove,
  useExperiencesControllerUpdate,
} from "@/lib/api/generated/experiences/experiences";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ExperienceRecord = {
  id?: string;
  title?: string;
  patientCountry?: string;
  procedureType?: string;
  storyText?: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
};

type ExperienceFormValues = {
  title: string;
  patientCountry: string;
  procedureType: string;
  storyText: string;
  beforeImageUrl: string;
  afterImageUrl: string;
};

const emptyFormValues: ExperienceFormValues = {
  title: "",
  patientCountry: "",
  procedureType: "",
  storyText: "",
  beforeImageUrl: "",
  afterImageUrl: "",
};

function normalizeExperiences(data: unknown): ExperienceRecord[] {
  if (Array.isArray(data)) {
    return data as ExperienceRecord[];
  }

  if (data && typeof data === "object") {
    if ("items" in data && Array.isArray((data as { items: unknown }).items)) {
      return (data as { items: ExperienceRecord[] }).items;
    }

    if ("data" in data && Array.isArray((data as { data: unknown }).data)) {
      return (data as { data: ExperienceRecord[] }).data;
    }
  }

  return [];
}

export default function ExperiencesTable() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.user?.organizationId);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExperience, setEditingExperience] =
    useState<ExperienceRecord | null>(null);

  const experiencesQuery = useExperiencesControllerGetExperiences({
    query: { enabled: !!organizationId },
  });
  const deleteExperienceMutation = useExperiencesControllerRemove();

  const experiences = useMemo(
    () => normalizeExperiences(experiencesQuery.data),
    [experiencesQuery.data],
  );

  const openCreateModal = () => {
    setEditingExperience(null);
    setIsModalOpen(true);
  };

  const openEditModal = (experience: ExperienceRecord) => {
    setEditingExperience(experience);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingExperience(null);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({
      queryKey: getExperiencesControllerGetExperiencesQueryKey(),
    });
  };

  const handleDelete = (experience: ExperienceRecord) => {
    if (!experience.id) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this experience? This action cannot be undone.",
    );

    if (!confirmed) {
      return;
    }

    deleteExperienceMutation.mutate(
      { id: experience.id },
      {
        onSuccess: () => {
          handleRefresh();
        },
      },
    );
  };

  if (!organizationId) {
    return (
      <div className="rounded-2xl border border-white/10 bg-transparent p-6 text-sm text-brand-ice/60">
        No organization selected. Finish onboarding to manage experiences.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-transparent shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-brand-ice">
            Experiences Library
          </h2>
          <p className="text-sm text-brand-ice/60">
            Manage social proof stories for your organization.
          </p>
        </div>
        <Button onClick={openCreateModal}>Add New</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-[#051126] text-left text-xs uppercase tracking-wide text-brand-ice/60">
            <tr>
              <th className="px-6 py-3">Title</th>
              <th className="px-6 py-3">Country</th>
              <th className="px-6 py-3">Procedure</th>
              <th className="px-6 py-3">Story Preview</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {experiencesQuery.isLoading && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-8 text-center text-brand-ice/60"
                >
                  Loading experiences...
                </td>
              </tr>
            )}

            {experiencesQuery.isError && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-rose-600">
                  Unable to load experiences right now.
                </td>
              </tr>
            )}

            {!experiencesQuery.isLoading &&
              !experiencesQuery.isError &&
              experiences.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-10 text-center text-brand-ice/60"
                  >
                    No experiences added yet.
                  </td>
                </tr>
              )}

            {experiences.map((experience, index) => (
              <tr key={experience.id ?? experience.title ?? index}>
                <td className="px-6 py-4 font-medium text-brand-ice">
                  {experience.title || "Untitled"}
                </td>
                <td className="px-6 py-4 text-brand-ice/60">
                  {experience.patientCountry || "-"}
                </td>
                <td className="px-6 py-4 text-brand-ice/60">
                  {experience.procedureType || "-"}
                </td>
                <td className="px-6 py-4 text-brand-ice/60">
                  <p className="max-w-xs truncate">
                    {experience.storyText || "No story provided."}
                  </p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(experience)}
                      disabled={!experience.id}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(experience)}
                      disabled={
                        !experience.id || deleteExperienceMutation.isPending
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ExperienceFormModal
        isOpen={isModalOpen}
        mode={editingExperience ? "edit" : "create"}
        experienceId={editingExperience?.id}
        initialValues={editingExperience ?? undefined}
        onClose={closeModal}
        onSaved={() => {
          closeModal();
          handleRefresh();
        }}
      />
    </div>
  );
}

type ExperienceFormModalProps = {
  isOpen: boolean;
  mode: "create" | "edit";
  experienceId?: string;
  initialValues?: ExperienceRecord;
  onClose: () => void;
  onSaved: () => void;
};

function ExperienceFormModal({
  isOpen,
  mode,
  experienceId,
  initialValues,
  onClose,
  onSaved,
}: ExperienceFormModalProps) {
  const createExperienceMutation = useExperiencesControllerCreateExperience();
  const updateExperienceMutation = useExperiencesControllerUpdate();
  const [formError, setFormError] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState } =
    useForm<ExperienceFormValues>({
      defaultValues: emptyFormValues,
    });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    reset({
      title: initialValues?.title || "",
      patientCountry: initialValues?.patientCountry || "",
      procedureType: initialValues?.procedureType || "",
      storyText: initialValues?.storyText || "",
      beforeImageUrl: initialValues?.beforeImageUrl || "",
      afterImageUrl: initialValues?.afterImageUrl || "",
    });
  }, [initialValues, isOpen, reset]);

  if (!isOpen) {
    return null;
  }

  const isSaving =
    createExperienceMutation.isPending || updateExperienceMutation.isPending;

  const handleError = (error: unknown) => {
    const fallbackMessage = "Unable to save this experience.";

    if (
      typeof error === "object" &&
      error !== null &&
      "response" in error &&
      typeof error.response === "object" &&
      error.response !== null &&
      "data" in error.response &&
      typeof error.response.data === "object" &&
      error.response.data !== null &&
      "message" in error.response.data
    ) {
      const message = error.response.data.message;
      setFormError(
        Array.isArray(message) ? message.join(", ") : String(message),
      );
      return;
    }

    if (error instanceof Error) {
      setFormError(error.message || fallbackMessage);
      return;
    }

    setFormError(fallbackMessage);
  };

  const onSubmit = (values: ExperienceFormValues) => {
    setFormError(null);
    const payload = {
      title: values.title.trim(),
      storyText: values.storyText.trim(),
      patientCountry: values.patientCountry.trim() || undefined,
      procedureType: values.procedureType.trim() || undefined,
      beforeImageUrl: values.beforeImageUrl.trim() || undefined,
      afterImageUrl: values.afterImageUrl.trim() || undefined,
    };

    if (mode === "edit" && experienceId) {
      updateExperienceMutation.mutate(
        { id: experienceId, data: payload as UpdateExperienceDto },
        {
          onSuccess: () => {
            onSaved();
          },
          onError: handleError,
        },
      );
      return;
    }

    createExperienceMutation.mutate(
      { data: payload as CreateExperienceDto },
      {
        onSuccess: () => {
          onSaved();
        },
        onError: handleError,
      },
    );
  };

  const handleClose = () => {
    setFormError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="experience-modal-title"
        className="w-full max-w-2xl rounded-2xl bg-[#051126] border border-white/10 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3
              id="experience-modal-title"
              className="text-xl font-semibold text-brand-ice"
            >
              {mode === "edit" ? "Edit Experience" : "Add Experience"}
            </h3>
            <p className="text-sm text-brand-ice/60">
              {mode === "edit"
                ? "Update story details for this patient experience."
                : "Create a new story to highlight patient outcomes."}
            </p>
          </div>
          <Button variant="ghost" onClick={handleClose} disabled={isSaving}>
            Close
          </Button>
        </div>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="experience-title">Title</Label>
              <Input
                id="experience-title"
                placeholder="Confident smile after implants"
                {...register("title", { required: "Title is required" })}
                disabled={isSaving}
              />
              {formState.errors.title && (
                <p className="text-xs text-rose-600">
                  {formState.errors.title.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="experience-country">Patient Country</Label>
              <Input
                id="experience-country"
                placeholder="United Kingdom"
                {...register("patientCountry")}
                disabled={isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="experience-procedure">Procedure Type</Label>
              <Input
                id="experience-procedure"
                placeholder="Dental implants"
                {...register("procedureType")}
                disabled={isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="experience-before">Before Image URL</Label>
              <Input
                id="experience-before"
                type="url"
                placeholder="https://example.com/before.jpg"
                {...register("beforeImageUrl")}
                disabled={isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="experience-after">After Image URL</Label>
              <Input
                id="experience-after"
                type="url"
                placeholder="https://example.com/after.jpg"
                {...register("afterImageUrl")}
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="experience-story">The Story</Label>
            <textarea
              id="experience-story"
              placeholder="Describe the patient's journey, timeline, and outcome."
              rows={5}
              disabled={isSaving}
              {...register("storyText", {
                required: "Story text is required",
              })}
              className="flex min-h-28 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm shadow-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {formState.errors.storyText && (
              <p className="text-xs text-rose-600">
                {formState.errors.storyText.message}
              </p>
            )}
          </div>

          {formError && (
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving
                ? "Saving..."
                : mode === "edit"
                  ? "Update Experience"
                  : "Create Experience"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
