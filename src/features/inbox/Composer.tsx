"use client";
import { useState } from "react";
import { isAxiosError } from "axios";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import type {
  InboxConversationDto,
  InboxMessagesPageDto,
  InboxSendErrorDto,
} from "@/lib/api/model";
import {
  getConversationsControllerPauseAiMutationOptions,
  getConversationsControllerResumeAiMutationOptions,
  useConversationsControllerSendMessage,
  getConversationsControllerGetConversationQueryKey,
  getConversationsControllerGetConversationsQueryKey,
  getConversationsControllerGetMessagesQueryKey,
} from "@/lib/api/generated/conversations/conversations";
import { Button } from "@/components/ui/button";
import { blockedCopy, mergeMessage } from "./model";
import { useInboxText } from "./i18n";

export function Composer({
  conversation,
  refreshing,
}: {
  conversation: InboxConversationDto;
  refreshing: boolean;
}) {
  const { t } = useInboxText();
  const client = useQueryClient();
  const send = useConversationsControllerSendMessage();
  const [content, setContent] = useState("");
  const [errorText, setErrorText] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [warning, setWarning] = useState("");
  const stateActions =
    useIsMutating({
      mutationKey:
        getConversationsControllerPauseAiMutationOptions().mutationKey,
    }) +
    useIsMutating({
      mutationKey:
        getConversationsControllerResumeAiMutationOptions().mutationKey,
    });
  const disabled =
    stateActions > 0 ||
    !conversation.aiPaused ||
    refreshing ||
    send.isPending ||
    blocked;
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({
        queryKey: getConversationsControllerGetConversationQueryKey(
          conversation.id,
        ),
      }),
      client.invalidateQueries({
        queryKey: getConversationsControllerGetConversationsQueryKey(),
      }),
      client.invalidateQueries({
        queryKey: getConversationsControllerGetMessagesQueryKey(
          conversation.id,
        ),
      }),
    ]);
  }
  return (
    <form
      className="shrink-0 space-y-2 border-t border-border p-3 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled || !content.trim()) return;
        setErrorText("");
        setWarning("");
        send.mutate(
          { id: conversation.id, data: { content: content.trim() } },
          {
            onSuccess: async (result) => {
              client.setQueryData<InfiniteData<InboxMessagesPageDto>>(
                getConversationsControllerGetMessagesQueryKey(conversation.id),
                (old) =>
                  mergeMessage(old, {
                    ...result,
                    status: result.deliveryStatus,
                  }),
              );
              if (result.warnings.includes("PATIENT_OPTED_OUT"))
                setWarning(t("optOutWarning"));
              if (
                result.deliveryStatus === "FAILED" ||
                result.deliveryStatus === "CANCELLED"
              )
                setErrorText(t("sendFailed"));
              else {
                setContent("");
                if (result.deliveryStatus === "UNKNOWN")
                  setErrorText(t("unknownTip"));
              }
              await refresh();
            },
            onError: async (error) => {
              if (isAxiosError<InboxSendErrorDto>(error)) {
                const body = error.response?.data;
                const copy = body?.code ? blockedCopy(body.code) : undefined;
                setErrorText(copy ? t(copy) : body?.message || t("sendFailed"));
                setBlocked(
                  error.response?.status === 422 &&
                    body?.code !== "PATIENT_OPTED_OUT",
                );
              } else setErrorText(t("sendFailed"));
              await refresh();
            },
          },
        );
      }}
    >
      {conversation.lead?.optedOut && (
        <p role="note" className="rounded-md border border-brand-cyan/40 p-2">
          {t("optedOut")}
        </p>
      )}
      {!conversation.aiPaused && <p>{t("pauseFirst")}</p>}
      {errorText && <p role="alert">{errorText}</p>}
      {warning && <p role="note">{warning}</p>}
      {blocked && (
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await refresh();
            setBlocked(false);
            setErrorText("");
          }}
        >
          {t("refreshState")}
        </Button>
      )}
      <label htmlFor="inbox-message" className="sr-only">
        {t("message")}
      </label>
      <textarea
        id="inbox-message"
        rows={2}
        className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm disabled:opacity-60"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={t("message")}
        disabled={disabled}
      />
      <Button type="submit" disabled={disabled || !content.trim()}>
        {send.isPending ? t("loading") : t("send")}
      </Button>
    </form>
  );
}
