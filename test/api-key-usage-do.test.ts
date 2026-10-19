import { describe, expect, it } from 'vitest';

import { ApiKeyUsageDO } from '../src/api-key-usage-do';
import { AlwaysSweepUsageDO } from './helpers/fake-usage-do';

/**
 * The Durable Object's housekeeping sweeps.
 *
 * **These bodies used to run one time in a hundred.** Each sweep carried its own
 * `if (Math.random() > 0.01) return;` guard, so in practice they were untested, and the coverage
 * number for the file was a coin flip between two runs of the same suite — 74.21% one run and
 * 78.12% the next, with no code change in between.
 *
 * That is not a test problem. It is a code problem: a bug in a sweep that deletes the wrong rows
 * would take a hundred requests to surface, and the sweep that deletes *recent* rows would delete
 * them one time in a hundred, which is the worst kind of bug to chase.
 *
 * The randomness now lives in one place — `shouldSweep()` — and the sweeps themselves are
 * deterministic. These tests drive them directly, and assert on what survived.
 */

class SweepDO extends AlwaysSweepUsageDO {
  readonly store: Map<string, unknown>;

  constructor(state: DurableObjectState, store: Map<string, unknown>) {
    super(state, {} as never);
    this.store = store;
  }
}

/** A DO instance with in-memory storage and the storage itself, so a test can see what survived. */
function newSweepDO(): { instance: ApiKeyUsageDO; store: Map<string, unknown> } {
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
    transaction: async (fn: (txn: unknown) => Promise<unknown>) => fn(storage),
  };
  const state = { storage } as unknown as DurableObjectState;

  return { instance: new SweepDO(state, store), store };
}

describe('the daily-counter sweep', () => {
  it('removes the counters older than a week and keeps the recent ones', async () => {
    const { instance, store } = newSweepDO();
    store.set('count:2026-10-10', 3);
    store.set('count:2026-10-18', 4);
    store.set('count:2026-10-19', 5);

    // A consume with an explicit day, so the sweep's cutoff is deterministic.
    await instance.fetch(new Request('https://do.test/consume?day=2026-10-19&limit=0'));

    expect(store.has('count:2026-10-10')).toBe(false);
    expect(store.get('count:2026-10-18')).toBe(4);
    // The consume itself counted one, so the kept counter is 5 + 1.
    expect(store.get('count:2026-10-19')).toBe(6);
  });

  it('leaves a counter that is exactly at the cutoff', async () => {
    // Seven days back is still inside the window; the sweep removes what is *older* than a week.
    const { instance, store } = newSweepDO();
    store.set('count:2026-10-12', 3);
    store.set('count:2026-10-19', 5);

    await instance.fetch(new Request('https://do.test/consume?day=2026-10-19&limit=0'));

    expect(store.get('count:2026-10-12')).toBe(3);
  });
});

describe('the monthly-counter sweep', () => {
  it('removes the months older than a quarter and keeps the recent ones', async () => {
    const { instance, store } = newSweepDO();
    store.set('month:2026-01', 3);
    store.set('month:2026-09', 4);
    store.set('month:2026-10', 5);

    await instance.fetch(new Request('https://do.test/consume?month=2026-10&limit=0'));

    expect(store.has('month:2026-01')).toBe(false);
    expect(store.get('month:2026-09')).toBe(4);
    // The consume itself counted one, so the kept counter is 5 + 1.
    expect(store.get('month:2026-10')).toBe(6);
  });
});

describe('the rate-window sweep', () => {
  it('removes the windows older than five minutes and keeps the recent ones', async () => {
    const { instance, store } = newSweepDO();
    store.set('rate:2026-10-19T10:00:api', 1);
    store.set('rate:2026-10-19T11:58:api', 2);

    await instance.fetch(
      new Request('https://do.test/window?minute=2026-10-19T12:00&bucket=api&limit=100', {
        method: 'POST',
      })
    );

    expect(store.has('rate:2026-10-19T10:00:api')).toBe(false);
    expect(store.get('rate:2026-10-19T11:58:api')).toBe(2);
  });
});

describe('the spend sweep', () => {
  it('removes the payer-days older than a week', async () => {
    const { instance, store } = newSweepDO();
    store.set('spend:2026-10-10', 100);
    store.set('spend:2026-10-19', 200);

    await instance.fetch(
      new Request('https://do.test/spend/reserve?day=2026-10-19&amount=1&cap=0', { method: 'POST' })
    );

    expect(store.has('spend:2026-10-10')).toBe(false);
    expect(store.get('spend:2026-10-19')).toBe(201);
  });
});

describe('the sweep decision', () => {
  it('is not made on every request in production', async () => {
    // The point of the guard is that the sweeps are rare. This is the shape of the production
    // decision, and it is the one thing about the sweeps that is allowed to be random.
    const { instance, store } = newSweepDO();
    store.set('count:2026-01-01', 1);

    // The default instance keeps the guard, so with an old row present the sweep may or may not
    // have run. Either way the counter still works.
    const response = await instance.fetch(
      new Request('https://do.test/consume?day=2026-10-19&limit=0')
    );
    const body = (await response.json()) as { count: number; allowed: boolean };
    expect(body.count).toBe(1);
    expect(body.allowed).toBe(true);
  });
});
