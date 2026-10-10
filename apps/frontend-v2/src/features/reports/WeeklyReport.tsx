"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { isAxiosError } from "axios";
import { useAuthStore } from "@/store/auth-store";
import { tenantQueryKey } from "@/lib/session-scope";
import {
  useAnalyticsControllerGetWeeklyReport,
  getAnalyticsControllerGetWeeklyReportQueryKey,
} from "@/lib/api/generated/analytics/analytics";
import {
  useUserProfileControllerGet,
  getUserProfileControllerGetQueryKey,
} from "@/lib/api/generated/users/users";
import { Button } from "@/components/ui/button";
import { ReadError } from "@/features/inbox/ReadError";
import { ReportFigures } from "./ReportFigures";
import { shiftWeek } from "./hooks";
import "./weekly-report.css";

export function WeeklyReport() {
  const user = useAuthStore((state) => state.user);
  const t = useTranslations("WeeklyReport");
  if (!user?.organizationId) return <p role="alert">{t("forbidden")}</p>;
  return (
    <ReportSession
      key={`${user.id}:${user.organizationId}`}
      userId={user.id}
      organizationId={user.organizationId}
    />
  );
}
function ReportSession({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  const [weekStart, setWeekStart] = useState<string>();
  const t = useTranslations("WeeklyReport");
  const locale = useLocale();
  const scope = { userId, organizationId };
  const params = weekStart ? { weekStart } : undefined;
  const query = useAnalyticsControllerGetWeeklyReport(params, {
    query: {
      queryKey: tenantQueryKey(
        scope,
        getAnalyticsControllerGetWeeklyReportQueryKey(params),
      ),
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  });
  const profile = useUserProfileControllerGet({
    query: {
      queryKey: tenantQueryKey(scope, getUserProfileControllerGetQueryKey()),
      retry: false,
      refetchOnWindowFocus: false,
    },
  });
  const clinic = profile.data?.memberships.find(
    (m) => m.organizationId === organizationId && m.status === "ACTIVE",
  )?.organizationName;
  // No placeholder or stale report while fetching, switching identity/week, or after errors.
  const report = !query.isFetching && !query.isError ? query.data : undefined;
  const printReady =
    !!report && !!clinic && !profile.isFetching && !profile.isError;
  const status = isAxiosError(query.error)
    ? query.error.response?.status
    : undefined;
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "Europe/Istanbul",
    }).format(new Date(value + "T00:00:00+03:00"));
  const instant = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Istanbul",
    }).format(new Date(value));
  const currentMonday = report
    ? new Date(Date.parse(report.asOf) + 3 * 3600000)
    : null;
  if (currentMonday)
    currentMonday.setUTCDate(
      currentMonday.getUTCDate() - ((currentMonday.getUTCDay() + 6) % 7),
    );
  const currentDate = currentMonday?.toISOString().slice(0, 10);
  const earliest = currentDate ? shiftWeek(currentDate, -52) : "";
  const refresh = () => {
    void query.refetch();
    if (profile.isError) void profile.refetch();
  };
  return (
    <article
      id="weekly-report"
      data-print-ready={printReady ? "true" : "false"}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="mx-auto max-w-4xl space-y-6 p-4 md:p-8"
    >
      <header>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p>{clinic ?? t("clinic")}</p>
      </header>
      <nav
        className="weekly-controls flex flex-wrap gap-3"
        aria-label={t("weekControls")}
      >
        <Button
          variant="outline"
          disabled={!report || report.period.weekStart <= earliest}
          onClick={() =>
            report && setWeekStart(shiftWeek(report.period.weekStart, -1))
          }
        >
          {t("previous")}
        </Button>
        <Button
          variant="outline"
          disabled={!report || report.period.weekStart === currentDate}
          onClick={() =>
            report && setWeekStart(shiftWeek(report.period.weekStart, 1))
          }
        >
          {t("next")}
        </Button>
        <Button variant="outline" disabled={query.isFetching} onClick={refresh}>
          {t("refresh")}
        </Button>
        <Button
          disabled={!printReady}
          onClick={() => {
            if (printReady) window.print();
          }}
        >
          {t("print")}
        </Button>
      </nav>
      {query.isFetching || query.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : query.isError ? (
        <>
          <p role="alert">
            {t(
              status === 403
                ? "forbidden"
                : status === 422
                  ? "tooLarge"
                  : "error",
            )}
          </p>
          <ReadError error={query.error} retry={refresh} />
        </>
      ) : report ? (
        <>
          <div>
            <p>
              {date(report.period.weekStart)} —{" "}
              {date(shiftWeek(report.period.weekEnd, -1 / 7))} ·{" "}
              {report.period.timezone}
            </p>
            {report.period.inProgress && (
              <p className="font-semibold" role="status">
                {t("inProgress")}
              </p>
            )}
            <p className="text-sm">
              {t("exclusiveEnd", { end: instant(report.period.endUtc) })} ·{" "}
              {t("cutoff", { time: instant(report.period.cutoffUtc) })}
            </p>
          </div>
          {report.patientMessages === 0 &&
            report.newLeads === 0 &&
            report.activity.denominator === 0 &&
            report.handedToTeamConversations === 0 && <p>{t("empty")}</p>}
          <ReportFigures report={report} />
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">{t("methodologyTitle")}</h2>
            <ul className="list-disc ps-5 space-y-1 text-sm">
              {report.methodology.map((code) => (
                <li key={code}>{t(`methodology.${code}`)}</li>
              ))}
            </ul>
            <p className="text-sm">
              {t("coverage", {
                legacy: report.coverage.legacyOriginMessages,
                unresolved: report.coverage.unresolvedHandoffReferences,
                classified: report.coverage.topicClassifiedConversations,
                unclassified: report.coverage.topicUnclassifiedConversations,
              })}
            </p>
          </section>
          <footer className="border-t border-border pt-3 text-sm">
            {t("generated", { time: instant(report.generatedAt) })} ·{" "}
            {report.period.timezone}
          </footer>
        </>
      ) : null}
      {profile.isError && (
        <ReadError error={profile.error} retry={() => void profile.refetch()} />
      )}
    </article>
  );
}
