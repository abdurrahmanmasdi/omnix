"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Socket } from "socket.io-client";
import { CanceledError } from "axios";
import { useAuthStore } from "@/store/auth-store";
import { resetSession } from "@/lib/session-manager";
import { refreshAccessToken } from "@/lib/api/token-refresh";
import {
  getOrCreateSocket,
  addRef,
  releaseRef,
  subscribeConnectionChange,
  getConnectionSnapshot,
  getServerSnapshot,
  getGlobalSocket,
} from "@/lib/socket-runtime";

export type {
  LiveMessagePayload,
  LeadUpdatePayload,
  ConversationUpdatePayload,
  NotificationInvalidationPayload,
} from "@/lib/contracts/socket-events.generated";

// ─── Public Hook ────────────────────────────────────────
/**
 * Singleton socket hook — one connection shared across the entire app.
 * Used by NotificationBell, ConversationsPage, and any future real-time consumer.
 *
 * Returns `{ socket, isConnected }`.
 */
export function useSocket(): { socket: Socket | null; isConnected: boolean } {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    // One shared refresh for Axios, connect errors and server disconnects
    // (single flight, KI-038). A failed refresh means the session is dead.
    const refresh = async () => {
      try {
        await refreshAccessToken();
        return true;
      } catch (error) {
        if (!(error instanceof CanceledError)) {
          console.error("[Socket] Refresh failed — session dead.");
          resetSession();
        }
        return false;
      }
    };

    const onConnectError = async (err: Error) => {
      console.warn("[Socket] Connection error:", err.message);

      // Auto-refresh JWT if token expired; the next automatic retry reads the
      // new token through the auth callback.
      if (err.message.includes("jwt expired")) {
        console.log("[Socket] Attempting token refresh...");
        await refresh();
      }
    };

    // The server drops the socket when the access token expires and
    // Socket.IO does not retry that on its own (KI-079): refresh once. The
    // new token normally replaces the socket (this effect re-runs); if this
    // socket is still the current one, reconnect it. The Inbox refetches on
    // "connect".
    const onServerDisconnect = async (socket: Socket) => {
      if (
        (await refresh()) &&
        getGlobalSocket() === socket &&
        !socket.connected
      )
        socket.connect();
    };

    const { socket: newSocket, generation } = getOrCreateSocket(accessToken, {
      onConnectError,
      onServerDisconnect,
      getToken: () => useAuthStore.getState().accessToken,
    });
    setSocket(newSocket);
    addRef();

    return () => {
      releaseRef(generation);
    };
  }, [accessToken]);

  // Subscribe to connection status changes
  const isConnected = useSyncExternalStore(
    subscribeConnectionChange,
    getConnectionSnapshot,
    getServerSnapshot,
  );

  return { socket, isConnected };
}
