import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

/**
 * KI-038: concurrent 401s (Axios and the socket) must share one /auth/refresh call.
 * The backend treats concurrent refresh-token reuse as theft and revokes the family.
 */

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  installSession: vi.fn(),
  resetSession: vi.fn(),
  token: "expired-token" as string | null,
}));

vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: mocks.post } };
});

vi.mock("@/lib/session-manager", () => ({
  installSession: (token: string, user: unknown) => {
    mocks.token = token;
    mocks.installSession(token, user);
  },
  resetSession: mocks.resetSession,
}));

vi.mock("@/store/auth-store", () => ({
  useAuthStore: { getState: () => ({ accessToken: mocks.token }) },
}));

import { incrementSessionGeneration } from "../session-scope";
import { refreshAccessToken } from "../api/token-refresh";
import { axiosInstance } from "../api/axios-client";

const user = {
  id: "user-1",
  organizationId: "org-1",
  hasCompletedOnboarding: true,
};
const deferred = () => {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("single-flight token refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token = "expired-token";
  });

  it("shares one refresh call between concurrent callers", async () => {
    const pending = deferred();
    mocks.post.mockReturnValue(pending.promise);

    const callers = Array.from({ length: 5 }, () => refreshAccessToken());
    pending.resolve({ data: { access_token: "fresh-token", user } });

    await expect(Promise.all(callers)).resolves.toEqual(
      Array(5).fill("fresh-token"),
    );
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/refresh$/),
      {},
      { withCredentials: true },
    );
    expect(mocks.installSession).toHaveBeenCalledTimes(1);
  });

  it("does not restore a session after a remote reset invalidates an in-flight refresh", async () => {
    const pending = deferred();
    mocks.post.mockReturnValue(pending.promise);
    const refresh = refreshAccessToken();
    incrementSessionGeneration();
    pending.resolve({ data: { access_token: "stale-token", user } });
    await expect(refresh).rejects.toThrow("Stale session refresh");
    expect(mocks.installSession).not.toHaveBeenCalled();
  });

  it("starts a new refresh after the previous one settled", async () => {
    mocks.post.mockResolvedValue({
      data: { access_token: "fresh-token", user },
    });
    await refreshAccessToken();
    await refreshAccessToken();
    expect(mocks.post).toHaveBeenCalledTimes(2);
  });

  it("rejects every waiter when the shared refresh fails", async () => {
    const pending = deferred();
    mocks.post.mockReturnValue(pending.promise);
    const callers = Array.from({ length: 3 }, () => refreshAccessToken());
    pending.reject(new Error("refresh rejected"));
    const results = await Promise.allSettled(callers);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it("5 parallel 401s from Axios trigger one refresh, then each request is retried", async () => {
    const pending = deferred();
    mocks.post.mockReturnValue(pending.promise);
    const seen: string[] = [];
    const adapter: AxiosAdapter = async (
      config: InternalAxiosRequestConfig,
    ) => {
      const auth = String(config.headers.Authorization);
      seen.push(auth);
      if (auth === "Bearer expired-token") {
        const error = Object.assign(new Error("Unauthorized"), {
          config,
          isAxiosError: true,
          response: {
            status: 401,
            data: {},
            headers: {},
            config,
            statusText: "Unauthorized",
          },
        });
        throw error;
      }
      return {
        data: { ok: true },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    };

    const requests = Array.from({ length: 5 }, (_, i) =>
      axiosInstance.get(`/leads/${i}`, { adapter }),
    );
    await vi.waitFor(() => expect(seen).toHaveLength(5));
    pending.resolve({ data: { access_token: "fresh-token", user } });

    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200, 200, 200,
    ]);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(seen.filter((auth) => auth === "Bearer fresh-token")).toHaveLength(
      5,
    );
    expect(mocks.resetSession).not.toHaveBeenCalled();
  });
});

describe("cross-tab refresh lock (KI-079)", () => {
  it("two tabs take turns instead of refreshing at the same moment", async () => {
    // Fake Web Locks shared by two independent module instances ("tabs").
    let tail: Promise<unknown> = Promise.resolve();
    const locks = {
      request: vi.fn((_name: string, work: () => Promise<unknown>) => {
        const run = tail.then(work);
        tail = run.catch(() => undefined);
        return run;
      }),
    };
    vi.stubGlobal("navigator", { ...navigator, locks });
    try {
      vi.resetModules();
      const tabA = await import("../api/token-refresh");
      vi.resetModules();
      const tabB = await import("../api/token-refresh");
      const first = deferred();
      mocks.post
        .mockReset()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValueOnce({ data: { access_token: "token-b", user } });

      const a = tabA.refreshAccessToken();
      const b = tabB.refreshAccessToken();
      await vi.waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(mocks.post).toHaveBeenCalledTimes(1); // tab B waits for tab A

      first.resolve({ data: { access_token: "token-a", user } });
      await expect(a).resolves.toBe("token-a");
      await expect(b).resolves.toBe("token-b");
      expect(mocks.post).toHaveBeenCalledTimes(2);
      expect(locks.request).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
