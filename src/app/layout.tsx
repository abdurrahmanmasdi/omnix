import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import QueryProvider from '@/providers/query-provider';
import { Toaster } from '@/components/ui/sonner';

const montserrat = localFont({ src: './fonts/montserrat-latin.woff2', weight: '100 900', variable: '--font-montserrat', display: 'swap' });
const inter = localFont({ src: './fonts/inter-latin.woff2', weight: '100 900', variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'OMNIX AI | Next-Gen AI Sales Agent',
  description: 'AI-Powered CRM and RAG Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${montserrat.variable} ${inter.variable}`}>
      <body className={`${inter.className} bg-background text-foreground antialiased`}>
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
