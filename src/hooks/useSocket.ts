'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { useAuthStore } from '@/store/auth-store';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

// ─── Payload Types (re-exported for consumers) ─────────
export interface LiveMessagePayload {
  conversationId: string;
  phoneNumber: string;
  message: {
    id: string;
    content: string;
    metaMessageId: string | null;
    type: string;
    handledBy: string;
    createdAt: string;
  };
}

// ─── Singleton Socket Manager ───────────────────────────
let globalSocket: Socket | null = null;
let connected = false;
let listeners = new Set<() => void>();

/** Notify all subscribers that connection status changed */
function emitChange() {
  listeners.forEach((l) => l());
}

function getOrCreateSocket(token: string): Socket {
  if (globalSocket?.connected) return globalSocket;

  globalSocket?.disconnect();

  globalSocket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
    autoConnect: true,
  });

  globalSocket.on('connect', () => {
    console.log('[Socket] 🟢 Connected:', globalSocket?.id);
    connected = true;
    emitChange();
  });

  globalSocket.on('disconnect', () => {
    console.log('[Socket] 🔴 Disconnected');
    connected = false;
    emitChange();
  });

  globalSocket.on('connect_error', async (err) => {
    console.warn('[Socket] Connection error:', err.message);
    connected = false;
    emitChange();

    // Auto-refresh JWT if token expired
    if (err.message.includes('jwt expired')) {
      console.log('[Socket] Attempting token refresh...');
      try {
        const res = await axios.post(
          `${SOCKET_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        // Updating Zustand re-triggers the hook's useEffect with the new token
        useAuthStore.getState().setAuth(res.data.access_token, res.data.user);
      } catch {
        console.error('[Socket] Refresh failed — session dead.');
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }
  });

  return globalSocket;
}

let refCount = 0;

// ─── Public Hook ────────────────────────────────────────
/**
 * Singleton socket hook — one connection shared across the entire app.
 * Used by NotificationBell, ConversationsPage, and any future real-time consumer.
 *
 * Returns `{ socket, isConnected }`.
 */
export function useSocket(): { socket: Socket | null; isConnected: boolean } {
  const accessToken = useAuthStore((s) => s.accessToken);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    const socket = getOrCreateSocket(accessToken);
    socketRef.current = socket;
    refCount++;

    return () => {
      refCount--;
      if (refCount <= 0) {
        socket.disconnect();
        globalSocket = null;
        connected = false;
        refCount = 0;
        emitChange();
      }
    };
  }, [accessToken]);

  // Subscribe to connection status changes
  const isConnected = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => connected,
    () => false // SSR snapshot
  );

  return { socket: socketRef.current, isConnected };
}
