"use client";

import { useTranslations } from "next-intl";
import { useAppLocale } from "@/i18n/provider";
import { messages } from "@/i18n/messages";
import type { AppLocale } from "@/i18n/locale";

export type InboxLocale = AppLocale;
export type InboxString = keyof typeof messages.tr.Inbox;
export function inboxText(locale: InboxLocale, key: InboxString): string {
  return messages[locale].Inbox[key];
}
export function useInboxText() {
  const { locale } = useAppLocale();
  const translate = useTranslations("Inbox");
  return { locale, t: translate };
}
