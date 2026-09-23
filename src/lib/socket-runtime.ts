// ─── Socket Runtime ─────────────────────────────────────
// Low-level socket lifecycle. Both useSocket.ts and session-manager.ts
// import this module — no circular dependency.

import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

// ─── State ──────────────────────────────────────────────
let globalSocket: Socket | null = null;
let connected = false;
let socketGeneration = 0;
let refCount = 0;
const listeners = new Set<() => void>();

/** Notify all useSyncExternalStore subscribers. */
function emitChange(): void {
  listeners.forEach((l) => l());
}

// ─── Public API ─────────────────────────────────────────

/** Current socket generation. Used by hook cleanup to detect staleness. */
export function getSocketGeneration(): number {
  return socketGeneration;
}

/**
 * Create or reuse the singleton socket connection.
 * Returns the socket and the generation it belongs to.
 */
export function getOrCreateSocket(
  token: string,
  onConnectError?: (err: Error) => void,
): { socket: Socket; generation: number } {
  // T20: Return the global socket if it exists, even if it's currently connecting
  if (globalSocket) {
    return { socket: globalSocket, generation: socketGeneration };
  }


  socketGeneration++;
  const myGeneration = socketGeneration;

  const newSocket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
    autoConnect: true,
  });

  newSocket.on('connect', () => {
    // Only update state if this socket is still the current one
    if (socketGeneration === myGeneration) {
      connected = true;
      emitChange();
    }
  });

  newSocket.on('disconnect', () => {
    if (socketGeneration === myGeneration) {
      connected = false;
      emitChange();
    }
  });

  if (onConnectError) {
    newSocket.on('connect_error', (err) => {
      if (socketGeneration === myGeneration) {
        connected = false;
        emitChange();
        onConnectError(err);
      }
    });
  }

  globalSocket = newSocket;
  return { socket: newSocket, generation: myGeneration };
}

/** Increment ref count (called by useSocket mount). */
export function addRef(): void {
  refCount++;
}

/**
 * Decrement ref count (called by useSocket cleanup).
 * Only acts if the caller still owns the current generation.
 */
export function releaseRef(callerGeneration: number): void {
  // Stale cleanup — a new socket has been created since this hook mounted
  if (callerGeneration !== socketGeneration) return;

  refCount--;
  if (refCount <= 0) {
    globalSocket = null;
    connected = false;
    refCount = 0;
    emitChange();
  }
}

/**
 * Force-disconnect the socket. Called by resetSession().
 * Safe to call multiple times.
 */
export function disconnectSocket(): void {
  globalSocket = null;
  connected = false;
  refCount = 0;
  socketGeneration++;
  emitChange();
}

// ─── useSyncExternalStore helpers ───────────────────────

export function subscribeConnectionChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getConnectionSnapshot(): boolean {
  return connected;
}

export function getServerSnapshot(): boolean {
  return false;
}

/** Get the current global socket (for reading, not lifecycle management). */
export function getGlobalSocket(): Socket | null {
  return globalSocket;
}
