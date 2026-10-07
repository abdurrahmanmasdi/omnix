"use client";
import { useTranslations } from "next-intl";
import type { InboxPatientDto } from "@/lib/api/model";
import { patientSummary } from "./patient-summary";

export function PatientFacts({ patient }: { patient: InboxPatientDto }) {
  const t = useTranslations("PatientReport");
  const data = patientSummary(patient.summary);
  return (
    <section className="my-4 space-y-3">
      <h4 className="font-semibold">{t("facts")}</h4>
      <dl className="space-y-2">
        <div>
          <dt className="text-xs text-muted-foreground">{t("treatment")}</dt>
          <dd>{data.treatmentInterest || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("travel")}</dt>
          <dd>{data.travelWindow || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("photo")}</dt>
          <dd>
            {data.photoSent === null ? "—" : t(data.photoSent ? "yes" : "no")}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("mood")}</dt>
          <dd>{data.mood ? t(data.mood) : "—"}</dd>
        </div>
      </dl>
      <h4 className="font-semibold">{t("handoff")}</h4>
      <p className="whitespace-pre-wrap break-words">
        {data.handoffSummary || t("noHandoff")}
      </p>
      <h4 className="font-semibold">{t("summary")}</h4>
      <p className="whitespace-pre-wrap break-words">
        {data.summary || t("noSummary")}
      </p>
    </section>
  );
}
