"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
import { Direction } from "radix-ui";
import { NextIntlClientProvider } from "next-intl";
import { useAuthStore } from "@/store/auth-store";
import { messages } from "./messages";
import { asLocale, type AppLocale } from "./locale";

const LocaleContext = createContext<{
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}>({ locale: "tr", setLocale: () => {} });
export function AppLocaleProvider({
  children,
  initialLocale = "tr",
}: {
  children: ReactNode;
  initialLocale?: AppLocale;
}) {
  const [chosen, setLocale] = useState(initialLocale);
  const saved = useAuthStore((state) => state.user?.locale);
  const locale = asLocale(saved) ?? chosen;
  useEffect(() => {
    z.config(z.locales[locale]());
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.cookie = `NEXT_LOCALE=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }, [locale]);
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <Direction.Provider dir={locale === "ar" ? "rtl" : "ltr"}>
        <NextIntlClientProvider
          locale={locale}
          messages={messages[locale]}
          timeZone="Europe/Istanbul"
        >
          {children}
        </NextIntlClientProvider>
      </Direction.Provider>
    </LocaleContext.Provider>
  );
}
export function useAppLocale() {
  return useContext(LocaleContext);
}
