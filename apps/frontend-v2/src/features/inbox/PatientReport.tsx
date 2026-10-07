"use client";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useConversationsControllerGetConversation } from "@/lib/api/generated/conversations/conversations";
import { Button } from "@/components/ui/button";
import { PatientFacts } from "./PatientFacts";
import { ReadError } from "./ReadError";
import { useThreadHistory } from "./hooks";
import { uniqueMessages, sender, delivery } from "./model";
import { useInboxText } from "./i18n";
import "./patient-report.css";

export function PatientReport({ id }: { id: string }) {
  const t = useTranslations("PatientReport");
  const { t: inbox } = useInboxText();
  const locale = useLocale();
  const detail = useConversationsControllerGetConversation(id, {
    query: { retry: false },
  });
  const history = useThreadHistory(id);
  if (detail.isPending)
    return (
      <p role="status" className="p-8">
        {inbox("loading")}
      </p>
    );
  if (detail.isError)
    return (
      <ReadError error={detail.error} retry={() => void detail.refetch()} />
    );
  if (!detail.data.lead) return <p className="p-8">{t("noPatient")}</p>;
  const patient = detail.data.lead;
  const messages = uniqueMessages(history.data?.pages ?? []);
  const events = messages.filter(
    (m, index) =>
      index === 0 ||
      m.type.startsWith("USER_") ||
      m.type === "SYSTEM" ||
      m.type === "LEAD_MEDIA" ||
      ["UNKNOWN", "FAILED", "CANCELLED"].includes(m.status),
  );
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  return (
    <article
      id="patient-report"
      className="mx-auto max-w-3xl space-y-6 p-4 md:p-8"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <nav className="report-controls flex flex-wrap items-center gap-4">
        <Link
          className="text-brand-cyan underline"
          href={`/dashboard/conversations?conversation=${encodeURIComponent(id)}`}
        >
          {t("back")}
        </Link>
        <Button
          disabled={
            history.isPending ||
            history.isError ||
            history.isFetching ||
            detail.isFetching
          }
          onClick={() => window.print()}
        >
          {t("print")}
        </Button>
      </nav>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <dl className="space-y-2">
        <div>
          <dt>{t("name")}</dt>
          <dd>{`${patient.firstName} ${patient.lastName}`.trim()}</dd>
        </div>
        <div>
          <dt>{t("country")}</dt>
          <dd>{patient.country || "—"}</dd>
        </div>
      </dl>
      <PatientFacts patient={patient} />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("events")}</h2>
        <p className="text-sm text-muted-foreground">{t("historyNote")}</p>
        {history.isError ? (
          <ReadError
            error={history.error}
            retry={() => void history.refetch()}
            messages
          />
        ) : history.isPending ? (
          <p role="status">{inbox("loading")}</p>
        ) : events.length ? (
          <ol className="space-y-4">
            {events.map((event) => (
              <li
                key={event.id}
                className="report-event border-b border-border pb-3"
              >
                <p className="text-sm text-muted-foreground">
                  {date(event.createdAt)} · {inbox(sender(event))} ·{" "}
                  {inbox(delivery(event).label)}
                </p>
                <p className="whitespace-pre-wrap break-words">
                  {event.type === "LEAD_MEDIA" ? t("photo") : event.content}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p>{t("noEvents")}</p>
        )}
        {history.hasNextPage && (
          <Button
            className="report-controls"
            variant="outline"
            disabled={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
          >
            {t("loadMore")}
          </Button>
        )}
      </section>
    </article>
  );
}
