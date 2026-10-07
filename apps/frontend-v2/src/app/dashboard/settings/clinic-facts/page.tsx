"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  useClinicFactsControllerRead,
  useClinicFactsControllerSave,
  useClinicFactsControllerApprove,
  getClinicFactsControllerReadQueryKey,
} from "@/lib/api/generated/clinic-facts/clinic-facts";
import type { ClinicFactsDto, ClinicFactSheetDto } from "@/lib/api/model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBackendError } from "@/i18n/backend";
import { Collections } from "./Collections";
import { ApprovedFacts } from "./ApprovedFacts";

const empty: ClinicFactsDto = {
  treatments: [],
  doctors: [],
  offers: [],
  warranty: "",
  process: "",
  days: "",
  location: "",
  paymentMethods: [],
  languages: [],
};
export default function ClinicFactsPage() {
  const t = useTranslations("ClinicFacts");
  const query = useClinicFactsControllerRead({ query: { retry: false } });
  const backendError = useBackendError();
  if (query.isPending)
    return (
      <p role="status" className="p-8">
        {t("loading")}
      </p>
    );
  if (query.isError)
    return (
      <div role="alert" className="p-8 space-y-3">
        <p>{backendError(query.error, t("loadFailed"))}</p>
        <Button onClick={() => void query.refetch()}>{t("retry")}</Button>
      </div>
    );
  return <Editor key={query.data.latest?.version ?? 0} sheet={query.data} />;
}
function Editor({ sheet }: { sheet: ClinicFactSheetDto }) {
  const t = useTranslations("ClinicFacts");
  const locale = useLocale();
  const [facts, setFacts] = useState<ClinicFactsDto>(
    sheet.latest?.facts ?? empty,
  );
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const save = useClinicFactsControllerSave();
  const approve = useClinicFactsControllerApprove();
  const client = useQueryClient();
  const backendError = useBackendError();
  const busy = save.isPending || approve.isPending;
  const dirty =
    JSON.stringify(facts) !== JSON.stringify(sheet.latest?.facts ?? empty);
  const refresh = () =>
    client.invalidateQueries({
      queryKey: getClinicFactsControllerReadQueryKey(),
    });
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  return (
    <div className="space-y-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
      <section className="rounded-xl border border-border p-4 space-y-2">
        <p>
          {sheet.approved
            ? t("approvedVersion", {
                version: sheet.approved.version,
                date: date(sheet.approved.approvedAt!),
              })
            : t("noneApproved")}
        </p>
        <p>
          {sheet.latest
            ? t("draftVersion", { version: sheet.latest.version })
            : t("empty")}
        </p>
        {sheet.approved && (
          <details>
            <summary>{t("viewApproved")}</summary>
            <ApprovedFacts facts={sheet.approved.facts} />
          </details>
        )}
      </section>
      <form
        className="space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setSaved(false);
          try {
            await save.mutateAsync({
              data: { expectedVersion: sheet.latest?.version ?? 0, facts },
            });
            setSaved(true);
            await refresh();
          } catch (err) {
            setError(err);
          }
        }}
      >
        <Collections facts={facts} change={setFacts} disabled={busy} />
        <fieldset
          disabled={busy}
          className="grid gap-4 rounded-xl border border-border p-4 md:grid-cols-2"
        >
          {(["warranty", "process", "days", "location"] as const).map((key) => (
            <label key={key} className="grid gap-1">
              {t(key)}
              <textarea
                className="rounded-md border border-border bg-background p-2"
                value={facts[key]}
                onChange={(e) => setFacts({ ...facts, [key]: e.target.value })}
              />
            </label>
          ))}
          {(["paymentMethods", "languages"] as const).map((key) => (
            <label key={key} className="grid gap-1">
              {t(key)}
              <Input
                value={facts[key].join(", ")}
                onChange={(e) =>
                  setFacts({
                    ...facts,
                    [key]: e.target.value.split(",").map((v) => v.trim()),
                  })
                }
              />
              <span className="text-xs text-muted-foreground">
                {t("commaSeparated")}
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy || (!dirty && !!sheet.latest)}>
            {t(busy ? "working" : "saveDraft")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              busy || dirty || !sheet.latest || !!sheet.latest.approvedAt
            }
            onClick={async () => {
              if (!sheet.latest || dirty) return;
              setError(null);
              try {
                await approve.mutateAsync({
                  data: { version: sheet.latest.version },
                });
                await refresh();
              } catch (err) {
                setError(err);
              }
            }}
          >
            {t("approve")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t("approvalHelp")}</p>
        {saved && <p role="status">{t("saved")}</p>}
        {error != null && (
          <p role="alert">{backendError(error, t("saveFailed"))}</p>
        )}
      </form>
    </div>
  );
}
