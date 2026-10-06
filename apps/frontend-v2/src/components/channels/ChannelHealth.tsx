"use client";
import { useLocale } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/i18n/copy";
import {
  getChannelsControllerGetChannelsQueryKey,
  useChannelsControllerVerifyConnection,
} from "@/lib/api/generated/channels/channels";

type ChannelHealthData = {
  id: string;
  provider: string;
  status: string;
  credential?: { status: string; lastVerifiedAt: string | null };
  metadata?: {
    subscriptionState?: string;
    historySyncState?: string;
    contactsSyncState?: string;
    historyProgress?: number;
    onboardingAt?: string;
  };
};
const states: Record<string, string> = {
  PENDING: "Waiting to request sync",
  REQUESTING: "Request being prepared",
  SENDING: "Request in progress",
  REQUESTED: "Import requested",
  IN_PROGRESS: "Import in progress",
  COMPLETE: "Import complete",
  DECLINED: "History sharing declined",
  EXPIRED: "Sync deadline expired",
  UNKNOWN: "Request outcome uncertain",
  READY: "Subscribed",
  SETUP_REQUIRED: "Meta webhook configuration required",
  ERROR: "Connection needs attention",
};
export function ChannelHealth({ channel }: { channel: ChannelHealthData }) {
  const copy = useCopy();
  const locale = useLocale();
  const queries = useQueryClient();
  const verify = useChannelsControllerVerifyConnection();
  const syncState = channel.metadata?.historySyncState;
  return (
    <div className="mt-4 space-y-2 text-xs text-brand-ice/60">
      <p>
        {copy("Last credential verification")}:{" "}
        {channel.credential?.lastVerifiedAt
          ? new Date(channel.credential.lastVerifiedAt).toLocaleString(locale)
          : copy("Never")}
      </p>
      {channel.metadata?.subscriptionState && (
        <p>
          {copy("Webhook subscription")}:{" "}
          {copy(
            states[channel.metadata.subscriptionState] ??
              channel.metadata.subscriptionState,
          )}
        </p>
      )}
      {syncState && (
        <p>
          {copy("History sync")}: {copy(states[syncState] ?? syncState)}
          {syncState === "IN_PROGRESS"
            ? ` (${channel.metadata?.historyProgress ?? 0}%)`
            : ""}
        </p>
      )}
      {channel.metadata?.contactsSyncState === "UNKNOWN" && (
        <p role="alert">
          {copy(
            "Contact sync outcome uncertain. Review with the founder before reconnecting.",
          )}
        </p>
      )}
      {channel.metadata?.onboardingAt &&
        !["COMPLETE", "DECLINED"].includes(syncState ?? "") && (
          <p>
            {copy("Sync deadline")}:{" "}
            {new Date(
              Date.parse(channel.metadata.onboardingAt) + 86400000,
            ).toLocaleString(locale)}
          </p>
        )}
      {syncState && (
        <p>
          {copy(
            "Keep the WhatsApp Business app open during sync. Imported messages are read-only.",
          )}
        </p>
      )}
      <p>
        {copy(
          "Verification reports the last check; Meta may become unavailable afterward.",
        )}
      </p>
      {channel.provider === "WHATSAPP_CLOUD_API" &&
        channel.status !== "DISCONNECTED" && (
          <Button
            variant="ghost"
            disabled={verify.isPending}
            onClick={() =>
              verify.mutate(
                { id: channel.id },
                {
                  onSuccess: () => {
                    void queries.invalidateQueries({
                      queryKey: getChannelsControllerGetChannelsQueryKey(),
                    });
                  },
                  onError: () =>
                    toast.error(
                      copy(
                        "Connection check failed. Other features remain available.",
                      ),
                    ),
                },
              )
            }
          >
            {copy("Check connection")}
          </Button>
        )}
    </div>
  );
}
