"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/i18n/copy";
import {
  useChannelsControllerGetEmbeddedSignupConfig,
  useChannelsControllerConnectEmbeddedSignup,
  getChannelsControllerGetChannelsQueryKey,
} from "@/lib/api/generated/channels/channels";

type FacebookSdk = {
  init(options: {
    appId: string;
    version: string;
    xfbml: boolean;
    cookie: boolean;
  }): void;
  login(
    callback: (response: { authResponse?: { code?: string } }) => void,
    options: {
      config_id: string;
      response_type: "code";
      override_default_response_type: true;
      extras: {
        setup: Record<string, never>;
        featureType: "whatsapp_business_app_onboarding";
        sessionInfoVersion: "3";
      };
    },
  ): void;
};
const sdk = () => (window as Window & { FB?: FacebookSdk }).FB;

export function EmbeddedSignupButton() {
  const copy = useCopy();
  const config = useChannelsControllerGetEmbeddedSignupConfig({
    query: { retry: false },
  });
  const connect = useChannelsControllerConnectEmbeddedSignup();
  const queries = useQueryClient();
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const onSession = (event: MessageEvent) => {
      if (
        !active.current ||
        !["https://www.facebook.com", "https://web.facebook.com"].includes(
          event.origin,
        )
      )
        return;
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
          // Session info is captured for feedback only. IDs/tokens never cross our API.
          setNotice(copy("Meta signup completed. Connecting your number…"));
        } else if (["CANCEL", "ERROR"].includes(data.event)) {
          setNotice(
            copy(
              "Meta signup was not completed. Retry or use the credential fallback.",
            ),
          );
        }
      } catch {
        /* Ignore unrelated or malformed cross-window messages. */
      }
    };
    window.addEventListener("message", onSession);
    return () => {
      active.current = false;
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("message", onSession);
    };
  }, [copy]);

  const launch = () => {
    const fb = sdk();
    if (!fb || !config.data?.configId || running || connect.isPending) return;
    active.current = true;
    setRunning(true);
    setNotice("");
    timer.current = setTimeout(() => {
      active.current = false;
      setRunning(false);
      setNotice(
        copy("Meta signup timed out. Retry or use the credential fallback."),
      );
    }, 120000);
    // Keep this synchronous in the click handler so the popup is not blocked.
    fb.login(
      (response) => {
        if (!active.current) return;
        active.current = false;
        if (timer.current) clearTimeout(timer.current);
        setRunning(false);
        const code = response.authResponse?.code;
        if (!code) {
          setNotice(
            copy(
              "Meta signup was not completed. Retry or use the credential fallback.",
            ),
          );
          return;
        }
        connect.mutate(
          { data: { code } },
          {
            onSuccess: () => {
              setNotice(
                copy(
                  "Connection saved. Check the channel subscription and history sync status below.",
                ),
              );
              void queries.invalidateQueries({
                queryKey: getChannelsControllerGetChannelsQueryKey(),
              });
            },
            onError: () =>
              setNotice(
                copy(
                  "Meta signup could not be completed. Retry or use the credential fallback.",
                ),
              ),
          },
        );
      },
      {
        config_id: config.data.configId,
        response_type: "code",
        override_default_response_type: true,
        // A new v4 Login for Business configuration selects the signup version.
        // Session info schema 3 is distinct from Embedded Signup v4 / Graph API version.
        extras: {
          setup: {},
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
        },
      },
    );
  };
  return (
    <div className="space-y-2">
      {config.data?.available && (
        <Script
          src="https://connect.facebook.net/en_US/sdk.js"
          strategy="afterInteractive"
          onReady={() => {
            if (!config.data?.appId) return;
            sdk()?.init({
              appId: config.data.appId,
              version: config.data.graphVersion,
              xfbml: false,
              cookie: false,
            });
            setReady(!!sdk());
          }}
          onError={() =>
            setNotice(copy("Meta is unavailable. Use the credential fallback."))
          }
        />
      )}
      <Button
        onClick={launch}
        disabled={!ready || running || connect.isPending}
      >
        {copy(
          running || connect.isPending
            ? "Connecting…"
            : "Connect existing WhatsApp number",
        )}
      </Button>
      <p className="max-w-lg text-xs text-brand-ice/60" role="status">
        {config.isPending
          ? copy("Loading Meta signup…")
          : config.isError || !config.data?.available
            ? copy(
                "Meta signup is not configured or unavailable. Use the credential fallback.",
              )
            : notice ||
              copy(
                "Keep your phone app. History sync must be requested within 24 hours of onboarding; history is read-only.",
              )}
      </p>
    </div>
  );
}
