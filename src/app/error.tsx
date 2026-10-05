"use client";

import { useInboxText } from "@/features/inbox/i18n";

export default function ErrorPage({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const { t } = useInboxText();
  return (
    <main className="p-8 text-sm" role="alert">
      <h1 className="text-lg font-semibold">{t("errorTitle")}</h1>
      <p className="my-3">{t("unavailable")}</p>
      <button className="rounded-md border p-3" onClick={unstable_retry}>
        {t("retry")}
      </button>
    </main>
  );
}
