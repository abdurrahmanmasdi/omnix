import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

/**
 * Session Manager Tests
 */

const storeState = vi.hoisted(() => ({
  accessToken: null as string | null,
  user: null as { id: string; organizationId: string | null; hasCompletedOnboarding: boolean } | null
}));

const mockCancelQueries = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockQueryCacheClear = vi.hoisted(() => vi.fn());
const mockMutationCacheClear = vi.hoisted(() => vi.fn());
const mockGetQueryCache = vi.hoisted(() => vi.fn().mockReturnValue({ clear: mockQueryCacheClear }));
const mockGetMutationCache = vi.hoisted(() => vi.fn().mockReturnValue({ clear: mockMutationCacheClear }));
const mockQueryClient = vi.hoisted(() => ({
  cancelQueries: mockCancelQueries,
  getQueryCache: mockGetQueryCache,
  getMutationCache: mockGetMutationCache,
}));

vi.mock('@/providers/query-provider', () => ({
  getQueryClient: () => mockQueryClient,
}));

const mockDisconnectSocket = vi.hoisted(() => vi.fn());
vi.mock('@/lib/socket-runtime', () => ({
  disconnectSocket: mockDisconnectSocket,
}));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      get accessToken() { return storeState.accessToken; },
      get user() { return storeState.user; },
      setAuth: (token: string, user: typeof storeState.user) => {
        storeState.accessToken = token;
        storeState.user = user;
      },
      logout: () => {
        storeState.accessToken = null;
        storeState.user = null;
      },
    }),
  },
}));


// Mock window.location
const originalLocation = window.location;
beforeAll(() => {
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, replace: vi.fn(), pathname: '/dashboard' },
    writable: true,
  });
});
afterAll(() => {
  Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
});

import { installSession, resetSession } from '../session-manager';
import { getSessionGeneration } from '../session-scope';

describe('session-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(storeState, { accessToken: null, user: null });
    (window.location.replace as any).mockClear();
  });

  describe('installSession', () => {
    it('clears cache when identity changes (different userId)', () => {
      Object.assign(storeState, {
        accessToken: 'old-token',
        user: { id: 'clinic-A', organizationId: 'org-1', hasCompletedOnboarding: true },
      });

      installSession('new-token', { id: 'clinic-B', organizationId: 'org-1', hasCompletedOnboarding: true });

      expect(mockCancelQueries).toHaveBeenCalled();
      expect(mockQueryCacheClear).toHaveBeenCalled();
      expect(mockMutationCacheClear).toHaveBeenCalled();
      expect(mockDisconnectSocket).toHaveBeenCalled();
      expect(storeState.accessToken).toBe('new-token');
      expect(storeState.user?.id).toBe('clinic-B');
    });

    it('clears cache when organizationId changes', () => {
      Object.assign(storeState, {
        accessToken: 'old-token',
        user: { id: 'user-1', organizationId: 'org-A', hasCompletedOnboarding: true },
      });

      installSession('new-token', { id: 'user-1', organizationId: 'org-B', hasCompletedOnboarding: true });

      expect(mockQueryCacheClear).toHaveBeenCalled();
      expect(mockDisconnectSocket).toHaveBeenCalled();
    });

    it('does NOT clear cache for same-identity token refresh', () => {
      Object.assign(storeState, {
        accessToken: 'old-token',
        user: { id: 'user-1', organizationId: 'org-1', hasCompletedOnboarding: true },
      });

      installSession('refreshed-token', { id: 'user-1', organizationId: 'org-1', hasCompletedOnboarding: true });

      expect(mockCancelQueries).not.toHaveBeenCalled();
      expect(mockQueryCacheClear).not.toHaveBeenCalled();
      expect(mockDisconnectSocket).not.toHaveBeenCalled();
      expect(storeState.accessToken).toBe('refreshed-token');
    });

    it('clears cache when old user is null (first login)', () => {
      Object.assign(storeState, { accessToken: null, user: null });

      installSession('token', { id: 'user-1', organizationId: 'org-1', hasCompletedOnboarding: true });

      expect(mockQueryCacheClear).toHaveBeenCalled();
    });

    it('increments session generation on identity change', () => {
      Object.assign(storeState, {
        accessToken: 'old-token',
        user: { id: 'user-A', organizationId: 'org-1', hasCompletedOnboarding: true },
      });

      const genBefore = getSessionGeneration();
      installSession('new-token', { id: 'user-B', organizationId: 'org-1', hasCompletedOnboarding: true });
      expect(getSessionGeneration()).toBeGreaterThan(genBefore);
    });

    it('does NOT increment session generation for same-identity refresh', () => {
      Object.assign(storeState, {
        accessToken: 'old-token',
        user: { id: 'user-1', organizationId: 'org-1', hasCompletedOnboarding: true },
      });

      const genBefore = getSessionGeneration();
      installSession('new-token', { id: 'user-1', organizationId: 'org-1', hasCompletedOnboarding: true });
      expect(getSessionGeneration()).toBe(genBefore);
    });
  });

  describe('resetSession', () => {
    it('clears all caches, disconnects socket, and navigates to login', async () => {
      Object.assign(storeState, {
        accessToken: 'token',
        user: { id: 'user-1', organizationId: 'org-1', hasCompletedOnboarding: true },
      });

      await resetSession();

      expect(mockCancelQueries).toHaveBeenCalled();
      expect(mockQueryCacheClear).toHaveBeenCalled();
      expect(mockMutationCacheClear).toHaveBeenCalled();
      expect(mockDisconnectSocket).toHaveBeenCalled();
      expect(storeState.accessToken).toBeNull();
      expect(storeState.user).toBeNull();
      expect(window.location.replace).toHaveBeenCalledWith('/login');
    });

    it('increments session generation', async () => {
      const genBefore = getSessionGeneration();
      await resetSession();
      expect(getSessionGeneration()).toBeGreaterThan(genBefore);
    });

    it('is idempotent — concurrent calls perform cleanup once', async () => {
      Object.assign(storeState, {
        accessToken: 'token',
        user: { id: 'user-1', organizationId: 'org-1', hasCompletedOnboarding: true },
      });

      // Fire two resets concurrently
      const [r1, r2] = await Promise.all([resetSession(), resetSession()]);

      // cancelQueries should only be called once (the second call shares the promise)
      expect(mockCancelQueries).toHaveBeenCalledTimes(1);
      expect(mockQueryCacheClear).toHaveBeenCalledTimes(1);
      expect(window.location.replace).toHaveBeenCalledTimes(1);
    });

    it('clinic A cache is absent after reset', async () => {
      Object.assign(storeState, {
        accessToken: 'clinic-A-token',
        user: { id: 'clinic-A', organizationId: 'org-A', hasCompletedOnboarding: true },
      });

      await resetSession();

      expect(mockQueryCacheClear).toHaveBeenCalled();
      expect(storeState.accessToken).toBeNull();
    });
  });

  describe('cross-identity isolation', () => {
    it('clinic B never observes clinic A data after installSession', () => {
      // Seed clinic A
      Object.assign(storeState, {
        accessToken: 'clinic-A-token',
        user: { id: 'clinic-A', organizationId: 'org-A', hasCompletedOnboarding: true },
      });

      // Switch to clinic B
      installSession('clinic-B-token', { id: 'clinic-B', organizationId: 'org-B', hasCompletedOnboarding: true });

      // Cache was cleared
      expect(mockQueryCacheClear).toHaveBeenCalled();
      expect(mockMutationCacheClear).toHaveBeenCalled();
    });

    it('two users in same org get separate sessions on transition', () => {
      Object.assign(storeState, {
        accessToken: 'token-alice',
        user: { id: 'alice', organizationId: 'shared-org', hasCompletedOnboarding: true },
      });

      installSession('token-bob', { id: 'bob', organizationId: 'shared-org', hasCompletedOnboarding: true });

      // Different userId → cache cleared
      expect(mockQueryCacheClear).toHaveBeenCalled();
      expect(mockDisconnectSocket).toHaveBeenCalled();
    });
  });

  describe('stale response protection', () => {
    it('session generation changes on identity change, poisoning old requests', () => {
      Object.assign(storeState, {
        accessToken: 'old-token',
        user: { id: 'user-A', organizationId: 'org-1', hasCompletedOnboarding: true },
      });

      const oldGeneration = getSessionGeneration();

      installSession('new-token', { id: 'user-B', organizationId: 'org-1', hasCompletedOnboarding: true });

      const newGeneration = getSessionGeneration();
      expect(newGeneration).toBeGreaterThan(oldGeneration);

      // A response stamped with oldGeneration would be rejected by the axios interceptor
    });
  });
});
