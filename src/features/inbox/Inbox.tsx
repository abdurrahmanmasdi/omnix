"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ConversationsControllerGetConversationsFilter } from "@/lib/api/model";
import {
  useConversationsControllerGetConversation,
  useConversationsControllerGetConversations,
} from "@/lib/api/generated/conversations/conversations";
import { useNotificationsControllerGetNotifications } from "@/lib/api/generated/notifications/notifications";
import { Button } from "@/components/ui/button";
import { ConversationList } from "./ConversationList";
import { ConversationHeader } from "./ConversationHeader";
import { Composer } from "./Composer";
import { Thread } from "./Thread";
import { PatientPanel } from "./PatientPanel";
import { ReadError } from "./ReadError";
import { useInboxSocket } from "./hooks";
import { useInboxText } from "./i18n";

function ActiveConversation({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const { t } = useInboxText();
  const [details, setDetails] = useState(false);
  const query = useConversationsControllerGetConversation(id);
  if (query.isPending)
    return (
      <p role="status" className="p-4 text-sm">
        {t("loading")}
      </p>
    );
  if (query.isError)
    return (
      <div>
        <Button variant="outline" onClick={onBack}>
          {t("back")}
        </Button>
        <ReadError
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      </div>
    );
  const conversation = query.data;
  if (!conversation) return null;
  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <ConversationHeader
          conversation={conversation}
          refreshing={query.isFetching}
          onBack={onBack}
        />
        {conversation.lead && (
          <Button
            className="m-2 self-start xl:hidden"
            variant="outline"
            onClick={() => setDetails((old) => !old)}
            aria-expanded={details}
          >
            {t("details")}
          </Button>
        )}
        <Thread id={id} />
        <Composer conversation={conversation} refreshing={query.isFetching} />
      </div>
      {conversation.lead && (
        <div
          className={`${details ? "absolute inset-0 z-20 bg-background xl:static" : "hidden"} w-full shrink-0 xl:block xl:w-72`}
        >
          <Button
            variant="outline"
            className="m-2 xl:hidden"
            aria-label={t("close")}
            onClick={() => setDetails(false)}
          >
            {t("close")}
          </Button>
          <PatientPanel
            key={`${id}:${conversation.lead.id}:${conversation.lead.firstName}:${conversation.lead.lastName}:${conversation.lead.phoneNumber}:${conversation.lead.email}:${conversation.lead.country}:${conversation.lead.primaryLanguage}`}
            patient={conversation.lead}
            conversationId={id}
          />
        </div>
      )}
    </div>
  );
}
export function Inbox() {
  const search = useSearchParams();
  const router = useRouter();
  const id = search.get("conversation");
  const leadId = search.get("lead");
  const linked = useConversationsControllerGetConversations(
    { leadId: leadId || undefined, limit: 1 },
    { query: { enabled: !!leadId && !id } },
  );
  useEffect(() => {
    const resolved = linked.data?.[0]?.id;
    if (leadId && !id && resolved)
      router.replace(
        `/dashboard/conversations?conversation=${encodeURIComponent(resolved)}`,
        { scroll: false },
      );
  }, [leadId, id, linked.data, router]);
  const [filter, setFilter] =
    useState<ConversationsControllerGetConversationsFilter>("all");
  const [unseen, setUnseen] = useState<Set<string>>(new Set());
  const onUnseen = useCallback(
    (conversationId: string) =>
      setUnseen((old) => new Set([...old, conversationId])),
    [],
  );
  const connected = useInboxSocket(id, onUnseen);
  const { t, locale, setLocale } = useInboxText();
  const notifications = useNotificationsControllerGetNotifications({
    limit: 100,
  });
  const unreadLeadIds = new Set<string>();
  const unreadConversationIds = new Set<string>();
  for (const item of notifications.data ?? [])
    if (!item.isRead && item.referenceId) {
      if (item.referenceType?.toUpperCase() === "LEAD")
        unreadLeadIds.add(item.referenceId);
      if (item.referenceType?.toUpperCase() === "CONVERSATION")
        unreadConversationIds.add(item.referenceId);
    }
  function select(conversationId: string | null) {
    if (conversationId)
      setUnseen((old) => {
        const next = new Set(old);
        next.delete(conversationId);
        return next;
      });
    router.push(
      conversationId
        ? `/dashboard/conversations?conversation=${encodeURIComponent(conversationId)}`
        : "/dashboard/conversations",
      { scroll: false },
    );
  }
  return (
    <div className="relative flex h-full min-h-0 flex-col text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
        <h1 className="text-lg font-semibold">{t("inbox")}</h1>
        <span className="text-xs text-muted-foreground" role="status">
          {connected ? t("connected") : t("disconnected")}
        </span>
        <select
          aria-label={t("language")}
          value={locale}
          onChange={(event) =>
            setLocale(event.target.value === "en" ? "en" : "tr")
          }
          className="rounded-md border border-border bg-background p-2 text-sm"
        >
          <option value="tr">Türkçe</option>
          <option value="en">English</option>
        </select>
      </div>
      <div className="flex min-h-0 flex-1">
        <div
          className={`${id ? "hidden md:block" : "block"} w-full shrink-0 border-r border-border md:w-80`}
        >
          <ConversationList
            filter={filter}
            onFilter={setFilter}
            activeId={id}
            onSelect={select}
            unseen={unseen}
            unreadLeadIds={unreadLeadIds}
            unreadConversationIds={unreadConversationIds}
          />
        </div>
        <div className={`${id ? "flex" : "hidden md:flex"} min-w-0 flex-1`}>
          {id ? (
            <ActiveConversation key={id} id={id} onBack={() => select(null)} />
          ) : leadId && linked.isError ? (
            <ReadError
              error={linked.error}
              retry={() => {
                void linked.refetch();
              }}
            />
          ) : (
            <p className="p-6 text-sm">
              {leadId
                ? linked.isPending
                  ? t("loading")
                  : t("missing")
                : t("select")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
