"use client";

import Link from "next/link";
import { useInboxText } from "@/features/inbox/i18n";

export default function NotFound() {
  const { t } = useInboxText();
  return (
    <main className="p-8 text-sm">
      <h1 className="mb-3 text-lg font-semibold">{t("notFound")}</h1>
      <Link
        className="text-brand-cyan underline"
        href="/dashboard/conversations"
      >
        {t("home")}
      </Link>
    </main>
  );
}
