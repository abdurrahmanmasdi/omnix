import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import QueryProvider from '@/providers/query-provider';
import { Toaster } from '@/components/ui/sonner'; // shadcn toast

const outfit = Outfit({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'OmniDesk CRM',
  description: 'AI-Powered CRM for Modern Clinics',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={outfit.className}>
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}