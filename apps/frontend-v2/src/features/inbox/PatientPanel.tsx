"use client";
import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { InboxPatientDto } from "@/lib/api/model";
import {
  useLeadsControllerUpdate,
  useLeadsControllerUpdateStage,
  getLeadsControllerFindAllQueryKey,
  getLeadsControllerFindOneQueryKey,
} from "@/lib/api/generated/leads/leads";
import {
  getConversationsControllerGetConversationQueryKey,
  getConversationsControllerGetConversationsQueryKey,
} from "@/lib/api/generated/conversations/conversations";
import { usePipelineStagesControllerFindAll } from "@/lib/api/generated/pipeline-stages/pipeline-stages";
import { Button } from "@/components/ui/button";
import { dirtyPatientFields, isMasked } from "./model";
import type { PatientEdits } from "./model";
import type { InboxString } from "./i18n";
import { useInboxText } from "./i18n";
import { ReadError } from "./ReadError";

export function PatientPanel({
  patient,
  conversationId,
}: {
  patient: InboxPatientDto;
  conversationId: string;
}) {
  const { t } = useInboxText();
  const client = useQueryClient();
  const [edits, setEdits] = useState<PatientEdits>({
    firstName: patient.firstName,
    lastName: patient.lastName,
    phoneNumber: patient.phoneNumber,
    email: patient.email,
    country: patient.country,
    primaryLanguage: patient.primaryLanguage,
  });
  const update = useLeadsControllerUpdate();
  const stage = useLeadsControllerUpdateStage();
  const stages = usePipelineStagesControllerFindAll();
  const fields: {
    key: keyof PatientEdits;
    label: InboxString;
    type?: string;
  }[] = [
    { key: "firstName", label: "firstName" },
    { key: "lastName", label: "lastName" },
    { key: "phoneNumber", label: "phone", type: "tel" },
    { key: "email", label: "email", type: "email" },
    { key: "country", label: "country" },
    { key: "primaryLanguage", label: "language" },
  ];
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({
        queryKey:
          getConversationsControllerGetConversationQueryKey(conversationId),
      }),
      client.invalidateQueries({
        queryKey: getConversationsControllerGetConversationsQueryKey(),
      }),
      client.invalidateQueries({
        queryKey: getLeadsControllerFindOneQueryKey(patient.id),
      }),
      client.invalidateQueries({
        queryKey: getLeadsControllerFindAllQueryKey(),
      }),
    ]);
  }
  const dirty = dirtyPatientFields(patient, edits);
  return (
    <aside
      aria-label={t("details")}
      className="h-full overflow-y-auto border-s border-border p-4 text-sm"
    >
      <h3 className="mb-3 text-base font-semibold">{t("details")}</h3>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (Object.keys(dirty).length)
            update.mutate(
              { id: patient.id, data: dirty },
              { onSuccess: refresh },
            );
        }}
      >
        {fields.map((field) => (
          <label key={field.key} className="block">
            <span className="text-xs text-muted-foreground">
              {t(field.label)}
            </span>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm disabled:opacity-60"
              type={field.type || "text"}
              value={edits[field.key] ?? ""}
              disabled={isMasked(patient[field.key]) || update.isPending}
              onChange={(event) =>
                setEdits((old) => ({ ...old, [field.key]: event.target.value }))
              }
            />
          </label>
        ))}
        {(isMasked(patient.phoneNumber) || isMasked(patient.email)) && (
          <p className="text-xs">{t("masked")}</p>
        )}
        <Button
          type="submit"
          variant="outline"
          disabled={update.isPending || !Object.keys(dirty).length}
        >
          {t("save")}
        </Button>
      </form>
      {update.isError && (
        <ReadError error={update.error} retry={() => update.reset()} />
      )}
      <dl className="my-4 space-y-2">
        <div>
          <dt className="text-xs text-muted-foreground">{t("timezone")}</dt>
          <dd>{patient.timezone || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("assignee")}</dt>
          <dd>{patient.assigneeName || t("unassigned")}</dd>
        </div>
      </dl>
      <label className="block">
        <span className="text-xs text-muted-foreground">{t("stage")}</span>
        <select
          aria-label={t("stage")}
          className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
          value={patient.pipelineStageId ?? ""}
          disabled={stages.isPending || stages.isError || stage.isPending}
          onChange={(event) => {
            if (event.target.value)
              stage.mutate(
                {
                  id: patient.id,
                  data: { pipelineStageId: event.target.value },
                },
                { onSuccess: refresh },
              );
          }}
        >
          <option value="" disabled>
            {patient.stageName || "—"}
          </option>
          {stages.data?.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      {stages.isError && (
        <ReadError
          error={stages.error}
          retry={() => {
            void stages.refetch();
          }}
        />
      )}
      {stage.isError && (
        <ReadError error={stage.error} retry={() => stage.reset()} />
      )}
      <h4 className="mt-5 font-semibold">{t("summary")}</h4>
      <p className="mt-2 whitespace-pre-wrap break-words">
        {patient.summary || t("noSummary")}
      </p>
      <Link
        className="mt-4 inline-block text-brand-cyan underline"
        href={`/dashboard/leads?highlight=${encodeURIComponent(patient.id)}`}
      >
        {t("leadLink")}
      </Link>
    </aside>
  );
}
