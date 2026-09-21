'use client';

import { useCallback } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { tenantQueryKey } from '@/lib/session-scope';

/**
 * Returns a `scopeKey(baseKey)` function that prefixes any query key
 * with `['session', userId, organizationId]`.
 *
 * Usage:
 *   const scopeKey = useTenantQueryKey();
 *   queryClient.invalidateQueries({ queryKey: scopeKey(['/leads']) });
 */
export function useTenantQueryKey(): (baseKey: readonly unknown[]) => readonly unknown[] {
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const organizationId = useAuthStore((s) => s.user?.organizationId ?? null);

  return useCallback(
    (baseKey: readonly unknown[]) =>
      tenantQueryKey({ userId, organizationId }, baseKey),
    [userId, organizationId],
  );
}
