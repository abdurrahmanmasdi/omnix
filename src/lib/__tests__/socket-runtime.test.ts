import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getOrCreateSocket,
  addRef,
  releaseRef,
  disconnectSocket,
  getGlobalSocket,
} from "../socket-runtime";
import { io } from "socket.io-client";

vi.mock("socket.io-client", () => {
  return {
    io: vi.fn(() => ({
      on: vi.fn(),
      disconnect: vi.fn(),
      removeAllListeners: vi.fn(),
    })),
  };
});

describe("socket-runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disconnectSocket(); // Reset state
  });

  it("creates a socket and reuses it for subsequent calls", () => {
    const { socket: s1, generation: g1 } = getOrCreateSocket("token1");
    const { socket: s2, generation: g2 } = getOrCreateSocket("token2");

    expect(s1).toBe(s2);
    expect(g1).toBe(g2);
    expect(io).toHaveBeenCalledTimes(1);
  });

  it("reference counting does not disconnect a socket still in use", () => {
    const { socket, generation } = getOrCreateSocket("token");

    addRef(); // Component A
    addRef(); // Component B

    releaseRef(generation); // Component A unmounts
    expect(socket.disconnect).not.toHaveBeenCalled();

    releaseRef(generation); // Component B unmounts
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.removeAllListeners).toHaveBeenCalled();
  });

  it("logout (disconnectSocket) force disconnects and ignores stale unmounts", () => {
    const { socket, generation } = getOrCreateSocket("token");
    addRef();

    disconnectSocket();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.removeAllListeners).toHaveBeenCalled();
    expect(getGlobalSocket()).toBeNull();

    // Stale unmount
    releaseRef(generation);

    // Verify it doesn't crash or affect a new socket
    const { socket: socket2 } = getOrCreateSocket("token2");
    expect(socket2).not.toBe(socket);
  });

  it("identity switch prevents old listeners from receiving events", () => {
    const { socket: oldSocket, generation: oldGen } =
      getOrCreateSocket("token1");
    addRef();

    disconnectSocket();

    const { generation: newGen } =
      getOrCreateSocket("token2");
    addRef();

    expect(oldGen).not.toBe(newGen);
    expect(oldSocket.disconnect).toHaveBeenCalled();
    expect(oldSocket.removeAllListeners).toHaveBeenCalled();
  });
});
