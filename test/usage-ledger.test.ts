import { describe, it, expect } from 'vitest';
import { DurableUsageLedger, InMemoryUsageLedger, StaticUsageLedger } from '../src/usage-ledger';
import { Env } from '../src/types';

function throwingDO(): Env {
  return {
    API_KEY_USAGE: {
      idFromName: () => 'id',
      get: () => ({ fetch: async () => { throw new Error('DO unavailable'); } })
    }
  } as unknown as Env;
}

describe('InMemoryUsageLedger', () => {
  it('counts and allows under the limit', async () => {
    const ledger = new InMemoryUsageLedger();
    const first = await ledger.consumeMonthly('c1', 5, Date.UTC(2026, 7, 15));
    const second = await ledger.consumeMonthly('c1', 5, Date.UTC(2026, 7, 15));
    expect([first.count, second.count]).toEqual([1, 2]);
    expect(second.allowed).toBe(true);
  });

  it('denies once over the hard limit and reports the previous count', async () => {
    const ledger = new InMemoryUsageLedger();
    await ledger.consumeMonthly('c1', 1, Date.UTC(2026, 7, 15));
    const second = await ledger.consumeMonthly('c1', 1, Date.UTC(2026, 7, 15));
    expect(second.allowed).toBe(false);
    expect(second.count).toBe(1);
    expect(second.limit).toBe(1);
  });
});

describe('StaticUsageLedger', () => {
  it('returns its canned result for every call', async () => {
    const ledger = new StaticUsageLedger({ allowed: false, count: 999, limit: 999, month: '2026-08' });
    expect(await ledger.consumeMonthly('c', 10)).toEqual({ allowed: false, count: 999, limit: 999, month: '2026-08' });
  });
});

describe('DurableUsageLedger policy', () => {
  it('fails CLOSED on a hard fuse when the DO throws', async () => {
    const ledger = new DurableUsageLedger(throwingDO());
    const result = await ledger.consumeMonthly('cust', 1000);
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(1000);
  });

  it('fails OPEN when unlimited so availability is not tied to the counter', async () => {
    const ledger = new DurableUsageLedger(throwingDO());
    const result = await ledger.consumeMonthly('cust', 0);
    expect(result.allowed).toBe(true);
  });

  it('peeks without throwing when the DO throws', async () => {
    const ledger = new DurableUsageLedger(throwingDO());
    const result = await ledger.peekMonthly('cust', 1000);
    expect(result.allowed).toBe(false);
  });

  it('fills the month when the DO omits it', async () => {
    const stub = {
      fetch: async () => new Response(JSON.stringify({ allowed: true, count: 3, limit: 100 }))
    };
    const env = {
      API_KEY_USAGE: { idFromName: () => 'id', get: () => stub }
    } as unknown as Env;
    const result = await new DurableUsageLedger(env).consumeMonthly('cust', 100, Date.UTC(2026, 7, 15));
    expect(result.month).toBe('2026-08');
  });
});
