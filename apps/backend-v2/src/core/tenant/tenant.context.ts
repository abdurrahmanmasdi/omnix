import { AsyncLocalStorage } from 'async_hooks';

export interface TenantStore {
  organizationId?: string;
  isSystemBypass?: boolean;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

export function getTenantId(): string | undefined {
  const store = tenantStorage.getStore();
  return store?.organizationId;
}

export function isSystemBypass(): boolean {
  const store = tenantStorage.getStore();
  return store?.isSystemBypass || false;
}
