import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import QueryProvider from '@/providers/query-provider';
import { Toaster } from '@/components/ui/sonner'; // shadcn toast

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Lean Commerce CRM',
  description: 'AI-Powered WhatsApp CRM',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}