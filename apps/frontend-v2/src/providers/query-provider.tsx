'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── SSR-Safe QueryClient ───────────────────────────────
// On the server, every request gets a fresh QueryClient so data from
// one request never leaks into another. In the browser, a single
// instance is reused for the lifetime of the tab.

// Client errors (403 no access, 404 missing, 401 handled by the auth layer)
// do not change on retry; retrying only delays the error message by ~7s.
// Timeouts, rate limits, network and 5xx errors keep the default 3 retries.
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response
    ?.status;
  if (status && status >= 400 && status < 500 && status !== 408 && status !== 429)
    return false;
  return failureCount < 3;
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute caching
        refetchOnWindowFocus: false,
        retry: shouldRetryQuery,
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