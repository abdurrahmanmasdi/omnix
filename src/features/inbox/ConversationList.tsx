"use client";
import type {
  InboxConversationDto,
  ConversationsControllerGetConversationsFilter,
} from "@/lib/api/model";
import { ConversationsControllerGetConversationsFilter as Filters } from "@/lib/api/model";
import { Button } from "@/components/ui/button";
import { useConversationList } from "./hooks";
import { useInboxText } from "./i18n";
import { ReadError } from "./ReadError";

export function ConversationList({
  filter,
  onFilter,
  activeId,
  onSelect,
  unseen,
  unreadLeadIds,
  unreadConversationIds,
}: {
  filter: ConversationsControllerGetConversationsFilter;
  onFilter: (filter: ConversationsControllerGetConversationsFilter) => void;
  activeId: string | null;
  onSelect: (id: string) => void;
  unseen: Set<string>;
  unreadLeadIds: Set<string>;
  unreadConversationIds: Set<string>;
}) {
  const query = useConversationList(filter);
  const { t } = useInboxText();
  const rows = new Map<string, InboxConversationDto>();
  for (const page of query.data?.pages ?? [])
    for (const row of page) rows.set(row.id, row);
  return (
    <section aria-label={t("inbox")} className="flex h-full flex-col">
      <div className="border-b border-border p-3">
        <label className="text-sm" htmlFor="inbox-filter">
          {t("inbox")}
        </label>
        <select
          id="inbox-filter"
          className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm"
          value={filter}
          onChange={(event) => {
            const value = event.target.value;
            const next = Object.values(Filters).find(
              (option) => option === value,
            );
            if (next) onFilter(next);
          }}
        >
          {Object.values(Filters).map((value) => (
            <option key={value} value={value}>
              {t(value)}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-muted-foreground">{t("filterHelp")}</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {query.isPending && (
          <p role="status" className="p-4 text-sm">
            {t("loading")}
          </p>
        )}
        {query.isError && (
          <ReadError
            error={query.error}
            retry={() => {
              void query.refetch();
            }}
          />
        )}
        {!query.isPending && !query.isError && rows.size === 0 && (
          <p className="p-4 text-sm">{t("emptyList")}</p>
        )}
        {[...rows.values()].map((row) => (
          <button
            key={row.id}
            aria-current={row.id === activeId ? "true" : undefined}
            onClick={() => onSelect(row.id)}
            className={`w-full border-b border-border p-4 text-left text-sm hover:bg-accent ${row.id === activeId ? "bg-accent" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <strong className="truncate">
                {row.lead
                  ? `${row.lead.firstName} ${row.lead.lastName}`
                  : t("patient")}
              </strong>
              {(unseen.has(row.id) ||
                unreadConversationIds.has(row.id) ||
                (row.leadId && unreadLeadIds.has(row.leadId))) && (
                <span
                  aria-label={t("unread")}
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-electric"
                />
              )}
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {row.lead?.primaryLanguage || "—"} ·{" "}
              {row.lead?.assigneeName || t("unassigned")}
            </p>
            <p className="mt-2 line-clamp-2 break-words">
              {row.messages[0]?.type === "AI_DRAFT" ? `${t("draft")}: ` : ""}
              {row.messages[0]?.content ?? t("previewHidden")}
            </p>
            <p className="mt-2 text-xs text-brand-cyan">
              {row.aiPaused ? t("paused") : t("active")}
            </p>
          </button>
        ))}
        {query.hasNextPage && (
          <Button
            className="m-3"
            variant="outline"
            onClick={() => {
              void query.fetchNextPage();
            }}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? t("loading") : t("more")}
          </Button>
        )}
      </div>
    </section>
  );
}
