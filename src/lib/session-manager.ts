// ─── Session Manager ────────────────────────────────────
// Centralised install / reset for identity transitions.
// Every auth path (login, signup, onboarding, axios refresh,
// socket refresh, logout) routes through here.

import { useAuthStore } from '@/store/auth-store';
import { getQueryClient } from '@/providers/query-provider';
import { disconnectSocket } from '@/lib/socket-runtime';
import { incrementSessionGeneration } from '@/lib/session-scope';

interface SessionUser {
  id: string;
  firstName?: string;
  lastName?: string;
  organizationId: string | null;
  hasCompletedOnboarding: boolean;
}

// ─── Reset Lock ─────────────────────────────────────────
// Makes resetSession idempotent: concurrent calls from a failed
// Axios refresh and a failed socket refresh share one promise.
let resetInProgress: Promise<void> | null = null;

/**
 * Install a new session. If the identity (userId or organizationId)
 * has changed, the prior session's cached data is wiped and the
 * socket is disconnected before the new credentials are stored.
 *
 * A same-identity token refresh (e.g. silent access-token rotation)
 * does NOT clear cached data.
 */
export function installSession(accessToken: string, user: SessionUser): void {
  const state = useAuthStore.getState();
  const oldUser = state.user;

  const identityChanged =
    !oldUser ||
    oldUser.id !== user.id ||
    oldUser.organizationId !== user.organizationId;

  if (identityChanged) {
    // Poison in-flight requests from old identity
    incrementSessionGeneration();

    const qc = getQueryClient();
    // Cancel running queries (cancelQueries is async but we fire-and-forget
    // here because installSession must be synchronous for login callbacks)
    qc.cancelQueries();
    qc.getQueryCache().clear();
    qc.getMutationCache().clear();

    // Tear down old socket so it reconnects with new auth
    disconnectSocket();
  }

  if (identityChanged) {
    publishSessionEvent({ type: 'identity', id: user.id, organizationId: user.organizationId });
  }

  // Store new credentials
  useAuthStore.getState().setAuth(accessToken, user);
}

/**
 * Fully reset the session. Called on logout, fatal refresh failure,
 * or any unrecoverable auth error.
 *
 * Idempotent: if already in progress, returns the existing promise.
 * Uses location.replace() so the protected page is not in the
 * browser's back-navigation stack.
 */
export async function resetSession(broadcast = true): Promise<void> {
  if (resetInProgress) return resetInProgress;

  resetInProgress = (async () => {
    try {
      // 1. Poison all in-flight requests immediately
      incrementSessionGeneration();

      if (broadcast) publishSessionEvent({ type: 'logout' });

      // Clear visible state synchronously, even if cancellation is slow.
      const qc = getQueryClient();
      const cancellation = qc.cancelQueries();

      // 3. Clear query and mutation caches
      qc.getQueryCache().clear();
      qc.getMutationCache().clear();

      // 4. Tear down old socket
      disconnectSocket();

      // 5. Clear Zustand auth + localStorage
      useAuthStore.getState().logout();

      await cancellation;

      // 6. Hard navigate — replace() prevents back-button to protected page
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.replace('/login');
      }
    } finally {
      resetInProgress = null;
    }
  })();

  return resetInProgress;
}


// Only invalidations and identity IDs cross tabs. Tokens stay in memory.
type SessionEvent = { type: 'logout' } | {
  type: 'identity'; id: string; organizationId: string | null;
};
const SESSION_EVENT_KEY = 'omnix-session-event';
let publishSessionEvent: (event: SessionEvent) => void = () => {};
let stopSessionSync: (() => void) | null = null;

export function startSessionSync(): () => void {
  if (stopSessionSync) return stopSessionSync;
  if (typeof window === 'undefined') return () => {};

  const receive = (data: unknown) => {
    if (!data || typeof data !== 'object') return;
    const event = data as Partial<SessionEvent>;
    if (event.type === 'identity') {
      if (typeof event.id !== 'string' ||
          (event.organizationId !== null && typeof event.organizationId !== 'string')) return;
      const current = useAuthStore.getState().user;
      // A cold tab hydrating the shared cookie must not log out the same identity.
      if (current?.id === event.id && current.organizationId === event.organizationId) return;
    } else if (event.type !== 'logout') return;
    void resetSession(false);
  };

  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel('omnix-session');
  } catch { /* Storage events work when the channel is unavailable. */ }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SESSION_EVENT_KEY || !event.newValue) return;
    try { receive(JSON.parse(event.newValue)); } catch { /* Ignore malformed data. */ }
  };
  if (channel) channel.onmessage = (event) => receive(event.data);
  else window.addEventListener('storage', onStorage);

  publishSessionEvent = (event) => {
    if (channel) channel.postMessage(event);
    else {
      try {
        window.localStorage.setItem(SESSION_EVENT_KEY, JSON.stringify({ ...event, nonce: crypto.randomUUID() }));
        window.localStorage.removeItem(SESSION_EVENT_KEY);
      } catch { /* Storage can be disabled by the browser. */ }
    }
  };
  stopSessionSync = () => {
    if (channel) { channel.onmessage = null; channel.close(); }
    window.removeEventListener('storage', onStorage);
    publishSessionEvent = () => {};
    stopSessionSync = null;
  };
  return stopSessionSync;
}

startSessionSync();
