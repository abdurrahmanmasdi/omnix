import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppLocaleProvider } from "@/i18n/provider";
import { getLocale } from "next-intl/server";
import { asLocale } from "@/i18n/locale";
import QueryProvider from "@/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";

const montserrat = localFont({
  src: "./fonts/montserrat-latin.woff2",
  weight: "100 900",
  variable: "--font-montserrat-latin",
  adjustFontFallback: false,
  fallback: [],
  display: "swap",
});
const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "100 900",
  variable: "--font-inter-latin",
  adjustFontFallback: false,
  fallback: [],
  display: "swap",
});

const montserratExt = localFont({
  src: "./fonts/montserrat-latin-ext.woff2",
  weight: "100 900",
  variable: "--font-montserrat-ext",
  display: "swap",
  adjustFontFallback: false,
  fallback: [],
});
const interExt = localFont({
  src: "./fonts/inter-latin-ext.woff2",
  weight: "100 900",
  variable: "--font-inter-ext",
  display: "swap",
  adjustFontFallback: false,
  fallback: [],
});

const arabic = localFont({
  src: "./fonts/noto-sans-arabic.ttf",
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OmniX — AI International Patient Coordinator",
  description: "Clinic patient enquiries, AI coordination and staff handoff.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = asLocale(await getLocale()) ?? "tr";
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      suppressHydrationWarning
      className={`${montserrat.variable} ${inter.variable} ${montserratExt.variable} ${interExt.variable} ${arabic.variable}`}
    >
      <body className={`font-inter bg-background text-foreground antialiased`}>
        <QueryProvider>
          <AppLocaleProvider initialLocale={locale}>
            {children}
            <Toaster />
          </AppLocaleProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
