"use client";
import { useState } from "react";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import type { InboxConversationDto } from "@/lib/api/model";
import {
  getConversationsControllerSendMessageMutationOptions,
  useConversationsControllerPauseAi,
  useConversationsControllerResumeAi,
  getConversationsControllerGetConversationQueryKey,
  getConversationsControllerGetConversationsQueryKey,
} from "@/lib/api/generated/conversations/conversations";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ReadError } from "./ReadError";
import { useInboxText } from "./i18n";

export function ConversationHeader({
  conversation,
  refreshing,
  onBack,
}: {
  conversation: InboxConversationDto;
  refreshing: boolean;
  onBack: () => void;
}) {
  const { t } = useInboxText();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const pause = useConversationsControllerPauseAi();
  const resume = useConversationsControllerResumeAi();
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: getConversationsControllerGetConversationQueryKey(
          conversation.id,
        ),
      }),
      queryClient.invalidateQueries({
        queryKey: getConversationsControllerGetConversationsQueryKey(),
      }),
    ]);
  }
  const sending = useIsMutating({
    mutationKey:
      getConversationsControllerSendMessageMutationOptions().mutationKey,
  });
  const pending =
    sending > 0 || refreshing || pause.isPending || resume.isPending;
  return (
    <header className="border-b border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={onBack}
          aria-label={t("back")}
          className="md:hidden"
        >
          ← {t("inbox")}
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">
            {conversation.lead
              ? `${conversation.lead.firstName} ${conversation.lead.lastName}`
              : t("patient")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {conversation.aiPaused ? t("paused") : t("active")}
          </p>
        </div>
        <Button
          disabled={pending}
          onClick={() => {
            if (conversation.aiPaused) setConfirm(true);
            else pause.mutate({ id: conversation.id }, { onSuccess: refresh });
          }}
        >
          {conversation.aiPaused ? t("resume") : t("takeOver")}
        </Button>
      </div>
      {(pause.isError || resume.isError) && (
        <ReadError
          error={pause.error || resume.error}
          retry={() => {
            pause.reset();
            resume.reset();
            void refresh();
          }}
        />
      )}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("resumeTitle")}</DialogTitle>
            <DialogDescription>{t("resumeBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              {t("cancel")}
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                resume.mutate(
                  { id: conversation.id },
                  {
                    onSuccess: async () => {
                      setConfirm(false);
                      await refresh();
                    },
                  },
                )
              }
            >
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
