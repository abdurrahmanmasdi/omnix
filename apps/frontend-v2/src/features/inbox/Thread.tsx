"use client";
import { useEffect, useRef } from "react";
import type { InboxMessageDto } from "@/lib/api/model";
import { Button } from "@/components/ui/button";
import { useThreadHistory } from "./hooks";
import { delivery, sender, uniqueMessages } from "./model";
import { useInboxText } from "./i18n";
import { ReadError } from "./ReadError";

export function MessageBubble({ message }: { message: InboxMessageDto }) {
  const { t, locale } = useInboxText();
  const who = sender(message);
  const state = delivery(message);
  return (
    <article
      aria-label={t(who)}
      className={`max-w-[90%] rounded-xl border p-3 text-sm ${who === "patient" ? "me-auto border-border bg-muted" : who === "system" ? "mx-auto border-border" : "ms-auto border-brand-electric/30 bg-brand-electric/10"} ${message.type === "AI_DRAFT" ? "border-dashed" : ""}`}
    >
      <p className="mb-1 text-xs font-semibold">{t(who)}</p>
      {message.origin === "WHATSAPP_PHONE" && (
        <p className="mb-1 text-xs font-semibold">☎ {t("sentFromPhone")}</p>
      )}
      {message.origin === "WHATSAPP_HISTORY" && (
        <p className="mb-1 text-xs text-muted-foreground">
          {t("importedHistory")}
        </p>
      )}
      <p className="whitespace-pre-wrap break-words" dir="auto">
        {message.content}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <time dateTime={message.createdAt}>
          {new Date(message.createdAt).toLocaleString(locale)}
        </time>
        <span
          title={t(state.tip)}
          aria-label={t(state.tip)}
          tabIndex={0}
          className={
            ["failed", "unknown", "draft"].includes(state.label)
              ? "font-semibold text-brand-cyan"
              : ""
          }
        >
          {t(state.label)}
        </span>
      </div>
    </article>
  );
}
export function Thread({ id }: { id: string }) {
  const history = useThreadHistory(id);
  const { t } = useInboxText();
  const messages = uniqueMessages(history.data?.pages ?? []);
  const end = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (
      scroller.current &&
      scroller.current.scrollHeight -
        scroller.current.scrollTop -
        scroller.current.clientHeight <
        180
    )
      end.current?.scrollIntoView({ block: "end" });
  }, [lastId]);
  if (history.isPending)
    return (
      <p className="p-4 text-sm" role="status">
        {t("loading")}
      </p>
    );
  if (history.isError && !history.isFetchNextPageError)
    return (
      <ReadError
        messages
        error={history.error}
        retry={() => {
          void history.refetch();
        }}
      />
    );
  return (
    <div
      ref={scroller}
      className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
      aria-label={t("message")}
    >
      {history.isFetchNextPageError && (
        <ReadError
          messages
          error={history.error}
          retry={() => {
            void history.fetchNextPage();
          }}
        />
      )}
      {history.hasNextPage && (
        <Button
          variant="outline"
          disabled={history.isFetchingNextPage}
          onClick={() => {
            void history.fetchNextPage();
          }}
        >
          {history.isFetchingNextPage ? t("loading") : t("older")}
        </Button>
      )}
      {!messages.length && <p className="text-sm">{t("noMessages")}</p>}
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      <div ref={end} />
    </div>
  );
}
