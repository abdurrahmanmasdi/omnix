import { describe, it, expect } from 'vitest';

import { tenantQueryKey, getSessionGeneration, incrementSessionGeneration } from '../session-scope';

describe('session-scope', () => {
  describe('tenantQueryKey', () => {
    it('prefixes keys with session, userId, and organizationId', () => {
      const key = tenantQueryKey(
        { userId: 'user-1', organizationId: 'org-1' },
        ['/leads'],
      );
      expect(key).toEqual(['session', 'user-1', 'org-1', '/leads']);
    });

    it('uses "no-organization" when organizationId is null', () => {
      const key = tenantQueryKey(
        { userId: 'user-1', organizationId: null },
        ['/leads'],
      );
      expect(key).toEqual(['session', 'user-1', 'no-organization', '/leads']);
    });

    it('different userId produces different key prefix', () => {
      const keyA = tenantQueryKey({ userId: 'user-A', organizationId: 'org-1' }, ['/leads']);
      const keyB = tenantQueryKey({ userId: 'user-B', organizationId: 'org-1' }, ['/leads']);
      expect(keyA[1]).not.toBe(keyB[1]);
    });

    it('different organizationId produces different key prefix', () => {
      const keyA = tenantQueryKey({ userId: 'user-1', organizationId: 'org-A' }, ['/leads']);
      const keyB = tenantQueryKey({ userId: 'user-1', organizationId: 'org-B' }, ['/leads']);
      expect(keyA[2]).not.toBe(keyB[2]);
    });

    it('preserves complex base keys with params', () => {
      const key = tenantQueryKey(
        { userId: 'u1', organizationId: 'o1' },
        ['/leads', { page: 1, status: 'NEW' }],
      );
      expect(key).toEqual(['session', 'u1', 'o1', '/leads', { page: 1, status: 'NEW' }]);
    });
  });

  describe('session generation', () => {
    it('starts at a number', () => {
      expect(typeof getSessionGeneration()).toBe('number');
    });

    it('increments monotonically', () => {
      const before = getSessionGeneration();
      const after = incrementSessionGeneration();
      expect(after).toBe(before + 1);
      expect(getSessionGeneration()).toBe(after);
    });

    it('increments multiple times', () => {
      const g1 = incrementSessionGeneration();
      const g2 = incrementSessionGeneration();
      const g3 = incrementSessionGeneration();
      expect(g3).toBe(g1 + 2);
      expect(g3).toBe(g2 + 1);
    });
  });
});
