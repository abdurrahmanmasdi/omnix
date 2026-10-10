"use client";
import { useLocale, useTranslations } from "next-intl";
import type { WeeklyReportDto } from "@/lib/api/model";
export function ReportFigures({ report }: { report: WeeklyReportDto }) {
  const t = useTranslations("WeeklyReport");
  const locale = useLocale();
  const number = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  const seconds = (value: number | null) =>
    value === null
      ? t("noSamples")
      : value >= 60
        ? t("minutes", { value: number(value / 60) })
        : t("seconds", { value: number(value) });
  const r = report.replyInterval;
  const metrics = [
    ["newLeads", report.newLeads],
    ["activeConversations", report.activeConversations],
    ["patientMessages", report.patientMessages],
    ["handedToTeam", report.handedToTeamConversations],
  ] as const;
  return (
    <>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <h2 className="sr-only">{t("summary")}</h2>
        {metrics.map(([key, value]) => (
          <div
            key={key}
            className="weekly-tile rounded-lg border border-border p-4"
          >
            <h3 className="font-semibold">{t(key)}</h3>
            <p className="text-2xl">{number(value)}</p>
            <p className="text-sm">{t(`definitions.${key}`)}</p>
          </div>
        ))}
        <div className="weekly-tile rounded-lg border border-border p-4">
          <h3 className="font-semibold">{t("consultations")}</h3>
          <p>{t("notTracked")}</p>
          <p className="text-sm">{t("definitions.consultations")}</p>
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("interval")}</h2>
        <p className="text-sm">{t("intervalDefinition")}</p>
        <p>
          {t("samples", {
            opportunities: r.opportunities,
            replied: r.replied,
            pending: r.pending,
          })}
        </p>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <dt>{t("median")}</dt>
            <dd>{seconds(r.medianSeconds)}</dd>
          </div>
          <div>
            <dt>{t("p90")}</dt>
            <dd>{seconds(r.p90Seconds)}</dd>
          </div>
          <div>
            <dt>{t("aiSamples", { count: r.ai.replied })}</dt>
            <dd>{seconds(r.ai.medianSeconds)}</dd>
          </div>
          <div>
            <dt>{t("staffSamples", { count: r.staff.replied })}</dt>
            <dd>{seconds(r.staff.medianSeconds)}</dd>
          </div>
        </dl>
        <p className="text-sm">
          {t("phoneExcluded", { count: report.coverage.excludedPhoneMessages })}
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("activity")}</h2>
        <p className="text-sm">{t("activityDefinition")}</p>
        <table className="w-full text-start">
          <thead>
            <tr>
              <th scope="col">{t("source")}</th>
              <th scope="col">{t("messages")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{t("aiReplies")}</th>
              <td>{number(report.activity.aiReplies)}</td>
            </tr>
            <tr>
              <th scope="row">{t("dashboardReplies")}</th>
              <td>{number(report.activity.staffDashboardReplies)}</td>
            </tr>
            <tr>
              <th scope="row">{t("phoneMessages")}</th>
              <td>{number(report.activity.staffPhoneMessages)}</td>
            </tr>
          </tbody>
        </table>
        <p>
          {t("mix", {
            total: report.activity.denominator,
            ai:
              report.activity.aiPercent === null
                ? "—"
                : number(report.activity.aiPercent),
            staff:
              report.activity.staffPercent === null
                ? "—"
                : number(report.activity.staffPercent),
          })}
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("topicsTitle")}</h2>
        <p className="text-sm">{t("topicsDefinition")}</p>
        {report.topics.length ? (
          <table className="w-full text-start">
            <thead>
              <tr>
                <th scope="col">{t("topic")}</th>
                <th scope="col">{t("conversations")}</th>
              </tr>
            </thead>
            <tbody>
              {report.topics.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{t(`topics.${row.id}`)}</th>
                  <td>{number(row.conversations)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>{t("noTopics")}</p>
        )}
      </section>
    </>
  );
}
