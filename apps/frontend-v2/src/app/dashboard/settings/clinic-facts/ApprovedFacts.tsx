"use client";
import { useLocale, useTranslations } from "next-intl";
import type { ClinicFactsDto } from "@/lib/api/model";

export function ApprovedFacts({ facts }: { facts: ClinicFactsDto }) {
  const t = useTranslations("ClinicFacts");
  const locale = useLocale();
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  return (
    <dl className="mt-3 space-y-4 whitespace-pre-wrap break-words text-sm">
      <div>
        <dt className="font-semibold">{t("treatments")}</dt>
        <dd>
          {facts.treatments.map((row, i) => (
            <p key={i}>
              {row.name} · {row.priceMin}–{row.priceMax} {row.currency} /{" "}
              {row.unit}
              <br />
              {t("included")}: {row.included || "—"}
            </p>
          ))}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">{t("doctors")}</dt>
        <dd>
          {facts.doctors.map((row, i) => (
            <p key={i}>
              {row.name} · {row.role} · {t("years")}: {row.years}
            </p>
          ))}
        </dd>
      </div>
      {(["warranty", "process", "days", "location"] as const).map((key) => (
        <div key={key}>
          <dt className="font-semibold">{t(key)}</dt>
          <dd>{facts[key] || "—"}</dd>
        </div>
      ))}
      {(["paymentMethods", "languages"] as const).map((key) => (
        <div key={key}>
          <dt className="font-semibold">{t(key)}</dt>
          <dd>{facts[key].join(", ") || "—"}</dd>
        </div>
      ))}
      <div>
        <dt className="font-semibold">{t("offers")}</dt>
        <dd>
          {facts.offers.map((row, i) => (
            <div key={i} className="mt-2">
              <p>{row.text}</p>
              <p>
                {t("enabled")}: {t(row.enabled ? "on" : "off")} ·{" "}
                {t("validFrom")}: {date(row.validFrom)} · {t("validTo")}:{" "}
                {date(row.validTo)}
              </p>
            </div>
          ))}
        </dd>
      </div>
    </dl>
  );
}
