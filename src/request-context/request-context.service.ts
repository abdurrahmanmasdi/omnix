import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextStore {
  tenantId?: string;
  isSystemBypass?: boolean;
}

@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<RequestContextStore>();

  run<T>(callback: () => T, initialStore: RequestContextStore = {}): T {
    return this.als.run(initialStore, callback);
  }

  runAsSystem<T>(callback: () => T): T {
    const currentStore = this.als.getStore();

    return this.als.run(
      {
        ...(currentStore ?? {}),
        isSystemBypass: true,
      },
      callback,
    );
  }

  setTenantId(tenantId: string): void {
    const store = this.als.getStore();

    if (store) {
      store.tenantId = tenantId;
      return;
    }

    this.als.enterWith({ tenantId });
  }

  getTenantId(): string | undefined {
    return this.als.getStore()?.tenantId;
  }

  isSystemBypass(): boolean {
    return this.als.getStore()?.isSystemBypass === true;
  }

  getStore(): Readonly<RequestContextStore> | undefined {
    const store = this.als.getStore();
    if (!store) {
      return undefined;
    }

    return { ...store };
  }
}
