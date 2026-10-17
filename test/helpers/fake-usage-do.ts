import { ApiKeyUsageDO } from '../../src/api-key-usage-do';
import type { Env } from '../../src/types';

/**
 * A Durable Object namespace backed by the real `ApiKeyUsageDO` and in-memory storage.
 *
 * The x402 spend cap shares that DO and is a fail-closed control, so any test that walks the paid
 * accept path needs the binding present — otherwise `reservePayerSpend` refuses and the request
 * never reaches settlement. Using the real class (not a stub) means the tests exercise the actual
 * counter logic, including its transaction.
 */

function fakeState() {
  const store = new Map<string, unknown>();
  const storage = {
    get: async (key: string) => store.get(key),
    put: async (key: string, value: unknown) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
    list: async ({ prefix }: { prefix?: string } = {}) => {
      const out = new Map<string, unknown>();
      for (const [key, value] of store) if (!prefix || key.startsWith(prefix)) out.set(key, value);
      return out;
    },
    // The DO wraps its read-modify-write in a transaction; the fake runs it inline.
    transaction: async (fn: (txn: unknown) => Promise<unknown>) => fn(storage),
  };
  return { storage } as unknown as DurableObjectState;
}

/** A DO instance with in-memory storage, for exercising the counter directly. */
export function newUsageDO(): ApiKeyUsageDO {
  return new ApiKeyUsageDO(fakeState(), {} as Env);
}

/** One DO instance per name, as the platform would give. */
export function fakeUsageNamespace(): DurableObjectNamespace {
  const instances = new Map<string, ApiKeyUsageDO>();
  return {
    idFromName: (name: string) => name as unknown as DurableObjectId,
    get: (id: unknown) => {
      const key = String(id);
      if (!instances.has(key)) instances.set(key, newUsageDO());
      const instance = instances.get(key) as ApiKeyUsageDO;
      return {
        fetch: (url: string, init?: RequestInit) => instance.fetch(new Request(url, init)),
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}
