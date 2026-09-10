"use client";

import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { CreateExperienceDto } from "@/lib/api/model";
import { useExperiencesControllerCreateExperience } from "@/lib/api/generated/experiences/experiences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AddExperienceFormProps = {
  organizationId: string;
};

type ExperienceFormState = {
  title: string;
  patientCountry: string;
  procedureType: string;
  storyText: string;
  beforeImageUrl: string;
  afterImageUrl: string;
};

const initialFormState: ExperienceFormState = {
  title: "",
  patientCountry: "",
  procedureType: "",
  storyText: "",
  beforeImageUrl: "",
  afterImageUrl: "",
};

export function AddExperienceForm({ organizationId }: AddExperienceFormProps) {
  const [form, setForm] = useState<ExperienceFormState>(initialFormState);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const createExperienceMutation = useExperiencesControllerCreateExperience();
  const isSaving = createExperienceMutation.isPending;
  const isSubmitDisabled = isSaving || !organizationId;

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    if (successMessage) {
      setSuccessMessage(null);
    }
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSuccessMessage(null);
    setErrorMessage(null);

    const payload: CreateExperienceDto = {
      title: form.title,
      storyText: form.storyText,
      patientCountry: form.patientCountry || undefined,
      procedureType: form.procedureType || undefined,
      beforeImageUrl: form.beforeImageUrl || undefined,
      afterImageUrl: form.afterImageUrl || undefined,
    };

    createExperienceMutation.mutate(
      { data: payload },
      {
        onSuccess: () => {
          setForm(initialFormState);
          setSuccessMessage("Experience saved successfully.");
          setErrorMessage(null);
        },
        onError: (error: unknown) => {
          const fallbackMessage = "Failed to save the experience.";

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
            setErrorMessage(
              Array.isArray(message) ? message.join(", ") : String(message),
            );
            return;
          }

          if (error instanceof Error) {
            setErrorMessage(error.message || fallbackMessage);
            return;
          }

          setErrorMessage(fallbackMessage);
        },
      },
    );
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#051126] p-6 shadow-none">
      <div className="mb-6 space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-brand-ice">
          Add Experience
        </h2>
        <p className="text-sm text-brand-ice/60">
          Save a new patient experience for the selected organization.
        </p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="Before and after smile transformation"
              disabled={isSubmitDisabled}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="patientCountry">Patient Country</Label>
            <Input
              id="patientCountry"
              name="patientCountry"
              value={form.patientCountry}
              onChange={handleChange}
              placeholder="Canada"
              disabled={isSubmitDisabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="procedureType">Procedure Type</Label>
            <Input
              id="procedureType"
              name="procedureType"
              value={form.procedureType}
              onChange={handleChange}
              placeholder="Dental implants"
              disabled={isSubmitDisabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="beforeImageUrl">Before Image URL</Label>
            <Input
              id="beforeImageUrl"
              name="beforeImageUrl"
              type="url"
              value={form.beforeImageUrl}
              onChange={handleChange}
              placeholder="https://example.com/before.jpg"
              disabled={isSubmitDisabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="afterImageUrl">After Image URL</Label>
            <Input
              id="afterImageUrl"
              name="afterImageUrl"
              type="url"
              value={form.afterImageUrl}
              onChange={handleChange}
              placeholder="https://example.com/after.jpg"
              disabled={isSubmitDisabled}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="storyText">The Story</Label>
          <textarea
            id="storyText"
            name="storyText"
            value={form.storyText}
            onChange={handleChange}
            placeholder="Describe the patient's journey and outcome."
            disabled={isSubmitDisabled}
            required
            rows={6}
            className="flex min-h-32 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm shadow-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {successMessage && (
          <div className="rounded-lg border border-brand-cyan/20 bg-brand-cyan/10 px-4 py-3 text-sm text-brand-cyan">
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
            {errorMessage}
          </div>
        )}

        <div className="flex items-center justify-end">
          <Button
            type="submit"
            disabled={isSubmitDisabled}
            className="min-w-36"
          >
            {isSaving ? "Saving..." : "Save Experience"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default AddExperienceForm;
