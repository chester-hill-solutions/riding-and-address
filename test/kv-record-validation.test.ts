import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { readJsonEntry, readTimestampedEntry, type KVNamespaceLike } from '../src/kv-cache';
import { loadApiKey, clearApiKeyCache } from '../src/api-keys';
import { loadCustomer, clearCustomerCache } from '../src/customer';
import type { Env } from '../src/types';

/**
 * A record read out of KV must be shape-checked, not cast. A value written by an older shape — or a
 * corrupted one — must be discarded as a miss, never trusted just because it parses as JSON. This is
 * the "Zod on projection/KV records" ratchet target from docs/adr/0005-billing-invariants-gate.md.
 */

function kv(entries: Record<string, unknown>): KVNamespaceLike {
  return {
    get: async (key: string) => entries[key] ?? null,
    put: async () => {},
    delete: async () => {},
  };
}

const PointSchema = z.object({ id: z.string(), n: z.number() });

describe('KV record validation', () => {
  beforeEach(() => {
    clearApiKeyCache();
    clearCustomerCache();
  });

  it('discards a JSON value that does not match the schema', async () => {
    const ns = kv({ k: { id: 42, n: 'not a number' } });
    expect(await readJsonEntry(ns, 'k', PointSchema)).toBeNull();
  });

  it('returns a value that does match the schema', async () => {
    const ns = kv({ k: { id: 'a', n: 1 } });
    expect(await readJsonEntry(ns, 'k', PointSchema)).toEqual({ id: 'a', n: 1 });
  });

  it('applies schema defaults rather than rejecting an older shape', async () => {
    const WithDefaults = z.object({ id: z.string(), origins: z.array(z.string()).default([]) });
    const ns = kv({ k: { id: 'a' } });
    expect(await readJsonEntry(ns, 'k', WithDefaults)).toEqual({ id: 'a', origins: [] });
  });

  it('discards a malformed timestamped entry and still expires a valid stale one', async () => {
    const schema = z.object({ timestamp: z.number(), value: z.string() });
    const malformed = kv({ k: { timestamp: 'soon', value: 1 } });
    expect(await readTimestampedEntry(malformed, 'k', 60_000, 'test', schema)).toBeNull();

    const fresh = kv({ k: { timestamp: Date.now(), value: 'ok' } });
    expect(await readTimestampedEntry(fresh, 'k', 60_000, 'test', schema)).toEqual({
      timestamp: expect.any(Number),
      value: 'ok',
    });

    const stale = kv({ k: { timestamp: Date.now() - 120_000, value: 'ok' } });
    expect(await readTimestampedEntry(stale, 'k', 60_000, 'test', schema)).toBeNull();
  });

  it('treats a malformed API key record as absent, not as a key', async () => {
    const env = { API_KEYS: kv({ 'key:pk_live_x': { id: 'pk_live_x' } }) } as unknown as Env;
    // Missing kind/customerId: the record is unusable, so the key must not authenticate.
    expect(await loadApiKey(env, 'pk_live_x')).toBeNull();
  });

  it('treats a malformed Customer record as absent, not as a free customer', async () => {
    const env = { API_KEYS: kv({ 'customer:c1': { id: 'c1' } }) } as unknown as Env;
    expect(await loadCustomer(env, 'c1')).toBeNull();
  });

  it('still loads a well-formed Customer record', async () => {
    const env = {
      API_KEYS: kv({ 'customer:c1': { id: 'c1', plan: 'free', fuseLimit: 1000 } }),
    } as unknown as Env;
    expect(await loadCustomer(env, 'c1')).toEqual({ id: 'c1', plan: 'free', fuseLimit: 1000 });
  });
});
