import React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * KI-079: the server drops the socket when the access token expires and
 * Socket.IO does not reconnect after a server disconnect. The client must
 * refresh once, reconnect with the new token and refetch the Inbox once.
 */

const mocks = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  type FakeSocket = InstanceType<typeof EventEmitter> & {
    connected: boolean;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    auth: (cb: (data: unknown) => void) => void;
  };
  const sockets: FakeSocket[] = [];
  return {
    sockets,
    post: vi.fn(),
    create(options: { auth: FakeSocket["auth"] }) {
      const socket = Object.assign(new EventEmitter(), {
        connected: false,
        connect: vi.fn(),
        disconnect: vi.fn(),
        auth: options.auth,
      }) as FakeSocket;
      sockets.push(socket);
      return socket;
    },
  };
});

vi.mock("socket.io-client", () => ({
  io: (_url: string, options: { auth: (cb: (d: unknown) => void) => void }) =>
    mocks.create(options),
}));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: mocks.post } };
});

import { useAuthStore } from "@/store/auth-store";
import { useSocket } from "@/hooks/useSocket";
import { useInboxSocket } from "@/features/inbox/hooks";
import { disconnectSocket } from "@/lib/socket-runtime";
import { getConversationsControllerGetConversationsQueryKey } from "@/lib/api/generated/conversations/conversations";

vi.stubGlobal("React", React);
const user = {
  id: "user-1",
  organizationId: "org-1",
  hasCompletedOnboarding: true,
};

function Live() {
  // Two consumers of the shared socket, as on the real dashboard
  // (Inbox + notification bell).
  useInboxSocket(null, () => undefined);
  useSocket();
  return null;
}

const listKey = JSON.stringify(
  getConversationsControllerGetConversationsQueryKey(),
);

afterEach(() => {
  cleanup();
  disconnectSocket();
  mocks.sockets.length = 0;
  vi.clearAllMocks();
});

describe("socket after access-token expiry (KI-079)", () => {
  it("refreshes once, reconnects with the new token and refetches the Inbox once", async () => {
    useAuthStore.setState({ accessToken: "expiring-token", user });
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <Live />
      </QueryClientProvider>,
    );
    expect(mocks.sockets).toHaveLength(1);
    const expired = mocks.sockets[0];
    act(() => {
      expired.emit("connect");
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const invalidate = vi.spyOn(client, "invalidateQueries");

    mocks.post.mockResolvedValue({
      data: { access_token: "fresh-token", user },
    });
    act(() => {
      expired.emit("disconnect", "io server disconnect");
    });
    await waitFor(() =>
      expect(useAuthStore.getState().accessToken).toBe("fresh-token"),
    );
    expect(mocks.post).toHaveBeenCalledTimes(1);

    // The live socket now authenticates with the new token; the torn-down
    // one is not revived.
    await waitFor(() => expect(mocks.sockets).toHaveLength(2));
    const live = mocks.sockets[1];
    const auth = vi.fn();
    live.auth(auth);
    expect(auth).toHaveBeenCalledWith({ token: "fresh-token" });
    expect(expired.connect).not.toHaveBeenCalled();

    act(() => {
      live.emit("connect");
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const listRefetches = invalidate.mock.calls.filter(
      ([filters]) => JSON.stringify(filters?.queryKey) === listKey,
    );
    expect(listRefetches).toHaveLength(1);
  });

  it("does not refresh on a client-side disconnect", async () => {
    useAuthStore.setState({ accessToken: "token", user });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Live />
      </QueryClientProvider>,
    );
    act(() => {
      mocks.sockets[0].emit("disconnect", "transport close");
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.sockets).toHaveLength(1);
  });
});
