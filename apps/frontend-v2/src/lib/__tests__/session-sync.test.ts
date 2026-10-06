import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clear: vi.fn(), cancel: vi.fn(), disconnect: vi.fn(),
  token: null as string | null,
  user: null as { id: string; organizationId: string | null } | null,
}));
vi.mock('@/providers/query-provider', () => ({ getQueryClient: () => ({
  cancelQueries: mocks.cancel,
  getQueryCache: () => ({ clear: mocks.clear }),
  getMutationCache: () => ({ clear: mocks.clear }),
}) }));
vi.mock('@/lib/socket-runtime', () => ({ disconnectSocket: mocks.disconnect }));
vi.mock('@/store/auth-store', () => ({ useAuthStore: { getState: () => ({
  user: mocks.user,
  setAuth: (token: string, user: typeof mocks.user) => { mocks.token = token; mocks.user = user; },
  logout: () => { mocks.token = null; mocks.user = null; },
}) } }));

class MockChannel {
  static instances: MockChannel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
  constructor(public name: string) { MockChannel.instances.push(this); }
  receive(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
}
const user = { id: 'user-a', organizationId: 'clinic-a', hasCompletedOnboarding: true };
let stop: () => void;
let manager: typeof import('../session-manager');

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  mocks.cancel.mockResolvedValue(undefined);
  mocks.token = 'old-token'; mocks.user = user;
  MockChannel.instances = [];
  vi.stubGlobal('BroadcastChannel', MockChannel);
  Object.defineProperty(window, 'location', { configurable: true, value: { pathname: '/login', replace: vi.fn() } });
  manager = await import('../session-manager');
  stop = manager.startSessionSync();
});
afterEach(() => { stop?.(); vi.unstubAllGlobals(); });

describe('cross-tab session sync', () => {
  it('remote logout clears identity, caches and socket before cancellation settles without rebroadcast', () => {
    mocks.cancel.mockReturnValue(new Promise(() => {}));
    MockChannel.instances[0].receive({ type: 'logout' });
    expect(mocks.user).toBeNull(); expect(mocks.token).toBeNull();
    expect(mocks.clear).toHaveBeenCalledTimes(2);
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(MockChannel.instances[0].postMessage).not.toHaveBeenCalled();
  });
  it.each([
    { id: 'user-b', organizationId: 'clinic-a' },
    { id: 'user-a', organizationId: 'clinic-b' },
  ])('remote identity change resets the other tab (%j)', (identity) => {
    MockChannel.instances[0].receive({ type: 'identity', ...identity });
    expect(mocks.user).toBeNull(); expect(mocks.clear).toHaveBeenCalledTimes(2);
  });
  it('same identity from a newly opened tab does not reset the session', () => {
    MockChannel.instances[0].receive({ type: 'identity', id: user.id, organizationId: user.organizationId });
    expect(mocks.user).toEqual(user); expect(mocks.clear).not.toHaveBeenCalled();
  });
  it('local identity change and logout notify peers, but token rotation does not', async () => {
    manager.installSession('rotated', user);
    expect(MockChannel.instances[0].postMessage).not.toHaveBeenCalled();
    manager.installSession('secret-token', { ...user, id: 'user-b' });
    expect(MockChannel.instances[0].postMessage).toHaveBeenCalledWith({ type: 'identity', id: 'user-b', organizationId: 'clinic-a' });
    await manager.resetSession();
    expect(MockChannel.instances[0].postMessage).toHaveBeenLastCalledWith({ type: 'logout' });
    expect(JSON.stringify(MockChannel.instances[0].postMessage.mock.calls)).not.toContain('secret-token');
  });
  it('falls back to storage events without BroadcastChannel', async () => {
    stop(); vi.stubGlobal('BroadcastChannel', undefined);
    stop = manager.startSessionSync();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await manager.resetSession();
    expect(setItem).toHaveBeenCalledWith('omnix-session-event', expect.stringContaining('logout'));
    mocks.user = user; mocks.token = 'old-token';
    window.dispatchEvent(new StorageEvent('storage', { key: 'omnix-session-event', newValue: JSON.stringify({ type: 'logout' }) }));
    expect(mocks.user).toBeNull();
  });
  it('ignores unrelated or malformed events and closes the channel on stop', () => {
    MockChannel.instances[0].receive({ type: 'identity' });
    MockChannel.instances[0].receive({ type: 'unrelated' });
    expect(mocks.user).toEqual(user);
    stop(); expect(MockChannel.instances[0].close).toHaveBeenCalledOnce();
  });
});
