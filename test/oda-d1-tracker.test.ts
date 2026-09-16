import { describe, it, expect } from 'vitest';
import {
  geocodeWithOda,
  geocodePostalCentroidWithOda,
  reverseGeocodeWithOda,
} from '../src/oda-geocoding';
import { getMetrics, resetMetrics } from '../src/metrics';
import { createOdaD1Tracker, getOdaD1QueryCountForRequest } from '../src/oda-d1-tracker';
import { createOdaFixtureEnv } from './helpers/oda-memory-db';
import { SUPPORTED_ODA_PROVINCES } from '../src/oda-import';
import type { Env } from '../src/types';

const { d1: fixtureD1 } = createOdaFixtureEnv();

function odaEnv(db: D1Database = fixtureD1): Env {
  return {
    RIDINGS: {} as R2Bucket,
    ODA_DB: db,
    ODA_GEOCODING_ENABLED: 'true',
    ODA_PROVINCES: SUPPORTED_ODA_PROVINCES.join(','),
    ODA_MIN_CONFIDENCE: '0.6',
  };
}

/**
 * A fake D1 that awaits `hook` before every statement resolves, so a test can pause a
 * query mid-flight and let another request interleave. The read is recorded by the tracker
 * before the statement runs, so counts include the paused query.
 */
function hookD1(inner: D1Database, hook: () => void | Promise<void>): D1Database {
  const source = inner as unknown as {
    prepare: (sql: string) => {
      bind: (...params: unknown[]) => {
        first: () => Promise<unknown>;
        all: () => Promise<unknown>;
      };
    };
  };
  return {
    prepare: (sql: string) => {
      const statement = source.prepare(sql);
      return {
        bind: (...params: unknown[]) => {
          const bound = statement.bind(...params);
          return {
            first: async () => {
              await hook();
              return bound.first();
            },
            all: async () => {
              await hook();
              return bound.all();
            },
          };
        },
      };
    },
    batch: async () => [],
  } as unknown as D1Database;
}

/** Releases every waiter once `arrivals` statements have reached it. */
function barrier(arrivals: number): { hook: () => Promise<void> } {
  let count = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    async hook() {
      count++;
      if (count >= arrivals) release();
      await gate;
    },
  };
}

describe('ODA D1 query budget', () => {
  it('uses at most 3 D1 reads for street interpolation without type', async () => {
    resetMetrics();
    await geocodeWithOda(odaEnv(), { address: '757 Victoria Park', city: 'Toronto', state: 'ON' });
    const metrics = getMetrics();
    expect(metrics.odaD1QueriesMaxPerRequest).toBeLessThanOrEqual(3);
  });

  it('uses 1 D1 read for exact match', async () => {
    resetMetrics();
    await geocodeWithOda(odaEnv(), { address: '123 Main St', city: 'Toronto', state: 'ON' });
    const metrics = getMetrics();
    expect(metrics.odaD1QueriesMaxPerRequest).toBe(1);
  });
});

describe('ODA D1 tracker', () => {
  it('counts reads per tracker and stops counting after end()', () => {
    const tracker = createOdaD1Tracker();
    tracker.record();
    tracker.record();
    expect(tracker.count()).toBe(2);
    expect(tracker.end()).toBe(2);
    tracker.record();
    expect(tracker.count()).toBe(2);
  });

  it('keeps two interleaved requests from observing each other\u2019s reads', async () => {
    const { d1 } = createOdaFixtureEnv();
    const gate = barrier(2);
    const db = hookD1(d1, gate.hook);
    const env = odaEnv(db);

    const trackerA = createOdaD1Tracker();
    const trackerB = createOdaD1Tracker();

    // '1 Nowhere Rd' takes five reads (exact, street exact/nearest/range, city centroid);
    // '123 Main St' takes one. Both pause at their first read so the calls interleave.
    const [a, b] = await Promise.allSettled([
      geocodeWithOda(env, { address: '1 Nowhere Rd', city: 'Toronto', state: 'ON' }, trackerA),
      geocodeWithOda(env, { address: '123 Main St', city: 'Toronto', state: 'ON' }, trackerB),
    ]);

    expect(a.status).toBe('rejected');
    expect(b.status).toBe('fulfilled');
    expect(trackerA.count()).toBe(5);
    expect(trackerB.count()).toBe(1);
  });

  it('a nested geocodeWithOda does not zero the outer request count', async () => {
    const { d1: raw } = createOdaFixtureEnv();
    let injectInner = true;
    let innerCount = -1;
    const outerTracker = createOdaD1Tracker();

    const db = hookD1(raw, async () => {
      if (!injectInner) return;
      injectInner = false;
      const innerTracker = createOdaD1Tracker();
      await geocodeWithOda(
        odaEnv(raw),
        { address: '123 Main St', city: 'Toronto', state: 'ON' },
        innerTracker
      );
      innerCount = innerTracker.count();
    });

    await expect(
      geocodeWithOda(
        odaEnv(db),
        { address: '1 Nowhere Rd', city: 'Toronto', state: 'ON' },
        outerTracker
      )
    ).rejects.toMatchObject({ code: 'ADDRESS_NOT_FOUND' });

    expect(innerCount).toBe(1);
    expect(outerTracker.count()).toBe(5);
  });

  it('untracked postal-centroid and reverse reads count globally, not against a request', async () => {
    resetMetrics();
    const legacyCountBefore = getOdaD1QueryCountForRequest();

    await geocodePostalCentroidWithOda(odaEnv(), { postal: 'M5V2T6', state: 'ON' });
    await reverseGeocodeWithOda(odaEnv(), 43.6532, -79.3832);

    const metrics = getMetrics();
    expect(metrics.odaD1Reads).toBeGreaterThan(0);
    expect(metrics.odaD1QueriesMaxPerRequest).toBe(0);
    expect(getOdaD1QueryCountForRequest()).toBe(legacyCountBefore);
  });
});
