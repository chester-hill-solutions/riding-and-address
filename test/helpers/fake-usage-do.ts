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
  return { storage, store } as unknown as DurableObjectState & { store: Map<string, unknown> };
}

/** A DO instance with in-memory storage, for exercising the counter directly. */
export function newUsageDO(): ApiKeyUsageDO {
  return new ApiKeyUsageDO(fakeState(), {} as Env);
}

/**
 * A DO instance with in-memory storage, and the storage itself.
 *
 * The store is handed back so a test can assert on what a sweep removed — which is the only way
 * to say "the sweep deleted the old rows and kept the recent ones" rather than "the sweep ran".
 */
export function newUsageDOWithStore(): { instance: ApiKeyUsageDO; store: Map<string, unknown> } {
  const state = fakeState();
  return { instance: new ApiKeyUsageDO(state, {} as Env), store: state.store };
}

/**
 * A DO instance whose housekeeping sweeps always run.
 *
 * The sweeps are guarded by `shouldSweep()`, which is true about one time in a hundred — the right
 * shape for production and the wrong one for a test, where it would mean the sweep bodies were
 * exercised at random and the coverage number was a coin flip between two runs of the same suite.
 *
 * Overriding the single decision point makes every sweep deterministic while leaving the sweeps
 * themselves untouched, which is what a test wants to exercise.
 */
export class AlwaysSweepUsageDO extends ApiKeyUsageDO {
  protected override shouldSweep(): boolean {
    return true;
  }
}

/**
 * A DO stub that answers the two different questions `ApiKeyUsageDO` is asked, **separately**.
 *
 * The DO serves both the daily/monthly quota (`/consume`, `/peek`) and the shared per-minute rate
 * window (`/window`). A stub that replies to every request with one canned body therefore answers
 * the rate question with the quota's answer — so a test that meant "the cap would block everything"
 * silently became "the rate limit blocks everything", and the response code changed underneath it
 * without the test changing. That is exactly what happened when the rate window moved into this DO.
 *
 * Answering per path keeps the two controls distinguishable, which is what the tests assert. Use
 * `fakeUsageNamespace()` instead when the counter has to be real — a rate limit cannot be tested
 * against a stub that always says yes.
 */
export function stubUsageNamespace(answers: {
  daily?: { allowed: boolean; count?: number; limit?: number };
  window?: { allowed: boolean; count?: number; limit?: number };
} = {}): DurableObjectNamespace {
  const daily = answers.daily ?? { allowed: true, count: 1, limit: 1000 };
  const window = answers.window ?? { allowed: true, count: 1, limit: 1000 };
  return {
    idFromName: () => 'id',
    get: () => ({
      fetch: async (input: string | Request) => {
        const url = typeof input === 'string' ? input : input.url;
        const answer = url.includes('/window') ? window : daily;
        return new Response(
          JSON.stringify({
            allowed: answer.allowed,
            count: answer.count ?? 1,
            limit: answer.limit ?? 1000,
            day: '2026-07-16',
            month: '2026-07',
            minute: '2026-07-16T12:00',
            bucket: 'stub',
          }),
        );
      },
    }),
  } as unknown as DurableObjectNamespace;
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
