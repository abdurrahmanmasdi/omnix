// ─── Session Scope ──────────────────────────────────────
// Identity-scoped query keys and session generation tracking.

export type SessionScope = {
  userId: string;
  organizationId: string | null;
};

/**
 * Prefix any tenant-owned query key with the active identity.
 * This ensures clinic A and clinic B (or two users in the same clinic)
 * never share cached data even within the same browser tab.
 */
export function tenantQueryKey(
  scope: SessionScope,
  baseKey: readonly unknown[],
): readonly unknown[] {
  return [
    'session',
    scope.userId,
    scope.organizationId ?? 'no-organization',
    ...baseKey,
  ] as const;
}

// ─── Session Generation ─────────────────────────────────
// Monotonically increasing counter. Incremented on every identity change
// or reset. In-flight requests stamped with an older generation are
// rejected by the Axios response interceptor.

let _sessionGeneration = 0;

export function getSessionGeneration(): number {
  return _sessionGeneration;
}

export function incrementSessionGeneration(): number {
  return ++_sessionGeneration;
}
