// ─── Single-flight token refresh (KI-038) ───────────────
// Axios and the socket share one in-flight POST /auth/refresh. The backend
// rotates the refresh cookie and treats concurrent reuse of the old one as
// theft (revokes the whole family), so parallel refreshes logged staff out.
//
// Uses bare axios.post, not axiosInstance, so the response interceptor can
// never loop on its own refresh call.

import axios, { CanceledError } from "axios";
import { getSessionGeneration } from "@/lib/session-scope";
import { installSession } from "@/lib/session-manager";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

let inFlight: Promise<string> | null = null;

// Across tabs: tabs share the refresh cookie, so they take turns (Web Locks).
// The later tab then sends the already-rotated cookie instead of reusing the
// old one at the same moment (KI-079 / KI-070). The backend also allows a
// short reuse grace; the lock keeps that for true races only.
const REFRESH_LOCK = "omnix-auth-refresh";
function withRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks ? (locks.request(REFRESH_LOCK, work) as Promise<T>) : work();
}

/**
 * Refresh the access token once for every concurrent caller and install the
 * new session. Resolves with the new access token; rejects when the refresh
 * fails (callers decide whether to reset the session).
 */
export function refreshAccessToken(): Promise<string> {
  if (!inFlight) {
    const generation = getSessionGeneration();
    inFlight = withRefreshLock(() =>
      axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true }),
    )
      .then((response) => {
        if (generation !== getSessionGeneration()) {
          throw new CanceledError("Stale session refresh");
        }
        const { access_token, user } = response.data;
        installSession(access_token, user);
        return access_token as string;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}
