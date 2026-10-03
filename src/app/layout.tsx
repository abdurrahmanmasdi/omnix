import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { InboxLocaleProvider } from "@/features/inbox/i18n";
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

export const metadata: Metadata = {
  title: "OmniX — AI International Patient Coordinator",
  description: "Clinic patient enquiries, AI coordination and staff handoff.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="tr"
      className={`${montserrat.variable} ${inter.variable} ${montserratExt.variable} ${interExt.variable}`}
    >
      <body className={`font-inter bg-background text-foreground antialiased`}>
        <QueryProvider>
          <InboxLocaleProvider>
            {children}
            <Toaster />
          </InboxLocaleProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
