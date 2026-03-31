import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextStore {
  tenantId?: string;
  bypassSystem?: boolean;
  isSystemBypass?: boolean;
}

@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<RequestContextStore>();

  runWith<T>(initialStore: RequestContextStore, callback: () => T): T {
    return this.als.run(initialStore, callback);
  }

  run<T>(callback: () => T, initialStore: RequestContextStore = {}): T {
    return this.als.run(initialStore, callback);
  }

  runAsSystem<T>(callback: () => Promise<T>): Promise<T> {
    return this.runWith({ bypassSystem: true }, callback);
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
    const store = this.als.getStore();
    return store?.bypassSystem === true || store?.isSystemBypass === true;
  }

  getStore(): Readonly<RequestContextStore> | undefined {
    const store = this.als.getStore();
    if (!store) {
      return undefined;
    }

    return { ...store };
  }
}
