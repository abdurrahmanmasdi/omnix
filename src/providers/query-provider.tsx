'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── SSR-Safe QueryClient ───────────────────────────────
// On the server, every request gets a fresh QueryClient so data from
// one request never leaks into another. In the browser, a single
// instance is reused for the lifetime of the tab.

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute caching
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Server: always create a new client
    return makeQueryClient();
  }
  // Browser: reuse one instance
  return (browserQueryClient ??= makeQueryClient());
}

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}