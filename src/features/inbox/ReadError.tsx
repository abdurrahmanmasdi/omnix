"use client";
import { isAxiosError } from "axios";
import { Button } from "@/components/ui/button";
import { useInboxText } from "./i18n";

export function ReadError({
  error,
  retry,
  messages = false,
}: {
  error: unknown;
  retry: () => void;
  messages?: boolean;
}) {
  const { t } = useInboxText();
  const status = isAxiosError(error) ? error.response?.status : undefined;
  const copy =
    status === 403 && messages
      ? "noAccess"
      : status === 404
        ? "missing"
        : "unavailable";
  return (
    <div
      role="alert"
      className="m-3 rounded-lg border border-destructive p-3 text-sm"
    >
      <p>{t(copy)}</p>
      <Button variant="outline" className="mt-2" onClick={retry}>
        {t("retry")}
      </Button>
    </div>
  );
}
