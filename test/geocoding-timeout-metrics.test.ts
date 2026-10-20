import { describe, it, expect, vi, afterEach } from 'vitest';
import { withTimeout, TimeoutError } from '../src/retry';
import { geocodeIfNeeded } from '../src/geocoding';
import { NoResultsError } from '../src/geocoder-providers';
import type { MetricsSink } from '../src/metrics';
import type { Env } from '../src/types';

/**
 * The two geocoding counters that were declared and served on /metrics but never written:
 * `odaStageTimeouts` and `geocodingErrors`. A cold isolate whose first ODA query exceeds the 3s
 * stage budget throws a `TimeoutError` that is rethrown (not a fallback), which surfaces to the
 * caller as a 503 LOOKUP_TIMEOUT (see test/lookup-timeout-response.test.ts) — and until these
 * counters were wired, that left no trace in metrics. See
 * docs/plans/reduce-external-geocoder-fallback.md (Wave 0).
 */

const nullKv = () =>
  ({
    get: async () => null,
    put: async () => {},
    delete: async () => {},
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
  }) as unknown as KVNamespace;

/** A D1 double whose queries never settle — the cold-start stall this test models. */
const hangingOdaDb = () =>
  ({
    prepare: () => ({
      bind: () => ({
        first: () => new Promise(() => {}),
        all: () => new Promise(() => {}),
      }),
    }),
  }) as unknown as D1Database;

const missOdaDb = () =>
  ({
    prepare: () => ({
      bind: () => ({
        first: async () => null,
        all: async () => ({ results: [] }),
      }),
    }),
  }) as unknown as D1Database;

function countingSink(): MetricsSink & { counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  return {
    counts,
    incrementMetric: (key) => {
      counts[key] = (counts[key] ?? 0) + 1;
    },
    recordTiming: () => {},
  } as MetricsSink & { counts: Record<string, number> };
}

const odaEnv = (db: D1Database): Env =>
  ({
    RIDINGS: {} as R2Bucket,
    GEOCODING_CACHE: nullKv(),
    ODA_DB: db,
    ODA_GEOCODING_ENABLED: 'true',
    ODA_PROVINCES: 'ON,QC',
  }) as unknown as Env;

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('withTimeout', () => {
  it('rejects with a typed TimeoutError so callers never match on message text', async () => {
    const never = new Promise<never>(() => {});
    await expect(withTimeout(never, 10, 'ODA geocoding')).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe('geocoding timeout metrics', () => {
  it('counts an ODA stage timeout as odaStageTimeouts and geocodingErrors', async () => {
    const sink = countingSink();

    await expect(
      geocodeIfNeeded(odaEnv(hangingOdaDb()), { address: '123 Main St', city: 'Toronto', state: 'ON' }, {
        metrics: sink,
      })
    ).rejects.toBeInstanceOf(TimeoutError);

    // The stage budget floor is 500ms, so this waits one floor rather than the 3s default.
    expect(sink.counts.odaStageTimeouts).toBe(1);
    expect(sink.counts.geocodingErrors).toBe(1);
  });

  it('does not count a resolved lookup as an error', async () => {
    const sink = countingSink();
    globalThis.fetch = vi.fn(async () => {
      throw new Error('external providers must not be called when ODA resolves');
    }) as typeof fetch;

    const exactRow = {
      id: 1,
      province: 'ON',
      civic_number: '123',
      street_name: 'MAIN',
      street_type: 'ST',
      street_direction: '',
      unit: '',
      postal_code: 'M5V 2T6',
      city: 'Toronto',
      lat: 43.6532,
      lon: -79.3832,
      full_address: '123 Main St',
      search_key: '123|MAIN|ST||TORONTO|ON',
    };
    const db = {
      prepare: () => ({
        bind: () => ({
          first: async () => exactRow,
          all: async () => ({ results: [exactRow] }),
        }),
      }),
    } as unknown as D1Database;

    await geocodeIfNeeded(odaEnv(db), { address: '123 Main St', city: 'Toronto', state: 'ON' }, {
      metrics: sink,
    });

    expect(sink.counts.odaStageTimeouts ?? 0).toBe(0);
    expect(sink.counts.geocodingErrors ?? 0).toBe(0);
  });

  it('does not count a data miss (NoResultsError) as a geocoding error', async () => {
    const sink = countingSink();
    globalThis.fetch = vi.fn(
      async () =>
        new Response('[]', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    ) as typeof fetch;

    await expect(
      geocodeIfNeeded(odaEnv(missOdaDb()), { address: '1 Nowhere Rd', city: 'Toronto', state: 'ON' }, {
        metrics: sink,
      })
    ).rejects.toBeInstanceOf(NoResultsError);

    expect(sink.counts.geocodingErrors ?? 0).toBe(0);
  });
});
