'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Socket } from 'socket.io-client';
import axios from 'axios';
import { useAuthStore } from '@/store/auth-store';
import { installSession, resetSession } from '@/lib/session-manager';
import {
  getOrCreateSocket,
  addRef,
  releaseRef,
  subscribeConnectionChange,
  getConnectionSnapshot,
  getServerSnapshot,
} from '@/lib/socket-runtime';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

// ─── Payload Types (re-exported for consumers) ─────────
export interface LiveMessagePayload {
  id: string;
  conversationId: string;
  senderId: string | null;
  content: string;
  mediaUrl: string | null;
  type: string;
  handledBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadUpdatePayload {
  id: string;
  organizationId: string;
  assignedAgentId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNumber: string;
  country: string;
  timezone: string;
  primaryLanguage: string;
  status: string;
  priority: string;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationUpdatePayload {
  id: string;
  organizationId: string;
  externalContactId: string | null;
  status: string;
  leadId: string | null;
  aiPaused: boolean;
  assignedAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

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

    const onConnectError = async (err: Error) => {
      console.warn('[Socket] Connection error:', err.message);

      // Auto-refresh JWT if token expired
      if (err.message.includes('jwt expired')) {
        console.log('[Socket] Attempting token refresh...');
        try {
          const res = await axios.post(
            `${SOCKET_URL}/auth/refresh`,
            {},
            { withCredentials: true },
          );
          // Route through centralised session manager
          installSession(res.data.access_token, res.data.user);
        } catch {
          console.error('[Socket] Refresh failed — session dead.');
          resetSession();
        }
      }
    };

    const { socket: newSocket, generation } = getOrCreateSocket(accessToken, onConnectError);
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
