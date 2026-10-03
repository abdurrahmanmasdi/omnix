// ─── Single-flight token refresh (KI-038) ───────────────
// Axios and the socket share one in-flight POST /auth/refresh. The backend
// rotates the refresh cookie and treats concurrent reuse of the old one as
// theft (revokes the whole family), so parallel refreshes logged staff out.
//
// Uses bare axios.post, not axiosInstance, so the response interceptor can
// never loop on its own refresh call.

import axios from "axios";
import { installSession } from "@/lib/session-manager";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

let inFlight: Promise<string> | null = null;

/**
 * Refresh the access token once for every concurrent caller and install the
 * new session. Resolves with the new access token; rejects when the refresh
 * fails (callers decide whether to reset the session).
 */
export function refreshAccessToken(): Promise<string> {
  if (!inFlight) {
    inFlight = axios
      .post(`${API_URL}/auth/refresh`, {}, { withCredentials: true })
      .then((response) => {
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
