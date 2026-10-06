"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PlatformLinkDto } from "@/lib/api/model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function PlatformLinkResult({
  issued,
  date,
  onClose,
}: {
  issued: PlatformLinkDto;
  date: (value: string) => string;
  onClose: () => void;
}) {
  const t = useTranslations("Platform");
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="space-y-3">
      <label htmlFor="platform-link">{t("link")}</label>
      <Input id="platform-link" readOnly dir="ltr" value={issued.link} />
      <p>
        {t("expiry")}: {date(issued.expiresAt)}
      </p>
      <p>{t("noEmail")}</p>
      <Button
        onClick={async () => {
          setFailed(false);
          try {
            await navigator.clipboard.writeText(issued.link);
            setCopied(true);
          } catch {
            setFailed(true);
          }
        }}
      >
        {t(copied ? "copied" : "copy")}
      </Button>
      {failed && <p role="alert">{t("copyFailed")}</p>}
      <Button data-testid="platform-link-close" onClick={onClose}>
        {t("close")}
      </Button>
    </div>
  );
}
