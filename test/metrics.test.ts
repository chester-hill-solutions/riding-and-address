import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  incrementMetric,
  getMetrics,
  getMetricsSummary,
  resetMetrics,
  ODA_METHOD_METRIC,
  ODA_MISS_METRIC,
  EXTERNAL_PROVIDER_METRIC,
} from '../src/metrics';
import { geocodeWithOda } from '../src/oda-geocoding';
import { geocodeIfNeeded } from '../src/geocoding';
import { createOdaFixtureEnv } from './helpers/oda-memory-db';
import type { Env } from '../src/types';

function fixtureEnv(): Env {
  const { d1 } = createOdaFixtureEnv();
  return {
    RIDINGS: {} as R2Bucket,
    ODA_DB: d1,
    ODA_GEOCODING_ENABLED: 'true',
    ODA_PROVINCES: 'ON,QC,BC',
    ODA_MIN_CONFIDENCE: '0.6',
  };
}

describe('metrics: geocoding fallback instrumentation', () => {
  beforeEach(() => resetMetrics());

  it('reports the local method mix, miss reasons and external calls', () => {
    incrementMetric('geocodingOdaMethodExact');
    incrementMetric('geocodingOdaMethodExact');
    incrementMetric('geocodingOdaMethodPostalStreet');
    incrementMetric('geocodingOdaMissAmbiguous');
    incrementMetric('geocodingExternalCalls');
    incrementMetric('geocodingExternalGoogle');

    const { geocodingFallback } = getMetricsSummary();
    expect(geocodingFallback.byMethod.exact).toBe(2);
    expect(geocodingFallback.byMethod.postal_street).toBe(1);
    expect(geocodingFallback.missReasons.ambiguous).toBe(1);
    expect(geocodingFallback.externalCalls).toBe(1);
    expect(geocodingFallback.providers.google).toBe(1);
    expect(geocodingFallback.odaResolved).toBe(3);
    // 3 resolved locally, 1 externally.
    expect(geocodingFallback.fallbackRate).toBe(25);
  });

  it('is zero-safe and resets with the window', () => {
    expect(getMetricsSummary().geocodingFallback.fallbackRate).toBe(0);
    incrementMetric('geocodingExternalCalls');
    resetMetrics();
    expect(getMetricsSummary().geocodingFallback.externalCalls).toBe(0);
  });

  it('counts the method the geocoder actually returns', async () => {
    await geocodeWithOda(fixtureEnv(), { address: '123 Main St', city: 'Toronto', state: 'ON' });
    expect(getMetricsSummary().geocodingFallback.byMethod.exact).toBe(1);
  });
});

describe('metrics: injectable sink isolation', () => {
  beforeEach(() => resetMetrics());

  it('routes a full geocodeIfNeeded run to an injected sink and leaves the global untouched', async () => {
    const sink = {
      incrementMetric: vi.fn(),
      recordTiming: vi.fn(),
      updateOdaD1QueriesMaxPerRequest: vi.fn(),
    };

    await geocodeIfNeeded(
      fixtureEnv(),
      { address: '123 Main St', city: 'Toronto', state: 'ON' },
      { metrics: sink }
    );

    const incremented = sink.incrementMetric.mock.calls.map(([key]) => key);
    expect(incremented).toContain('geocodingRequests');
    expect(incremented).toContain('geocodingOdaMethodExact');
    expect(incremented).toContain('odaD1Reads');
    expect(sink.recordTiming).toHaveBeenCalled();
    expect(sink.updateOdaD1QueriesMaxPerRequest).toHaveBeenCalledWith(1);

    // Everything landed on the sink; the module global saw none of it.
    expect(getMetrics()).toEqual(
      Object.fromEntries(Object.keys(getMetrics()).map((key) => [key, 0]))
    );
  });

  it('does not leak ODA method metrics into the global when a sink is injected', async () => {
    // Deliberately omit the optional max method: a lightweight spy must still be assignable.
    const sink = { incrementMetric: vi.fn(), recordTiming: vi.fn() };

    await geocodeWithOda(
      fixtureEnv(),
      { address: '123 Main St', city: 'Toronto', state: 'ON' },
      undefined,
      sink
    );

    expect(sink.incrementMetric).toHaveBeenCalledWith('geocodingOdaMethodExact');
    expect(getMetrics().geocodingOdaMethodExact).toBe(0);
  });
});

describe('metrics: registration maps', () => {
  beforeEach(() => resetMetrics());

  it('every registered metric is a real Metrics key', () => {
    const metricKeys = new Set(Object.keys(getMetrics()));
    for (const key of Object.values(ODA_METHOD_METRIC)) expect(metricKeys.has(key)).toBe(true);
    for (const { metric } of Object.values(ODA_MISS_METRIC)) expect(metricKeys.has(metric)).toBe(true);
    for (const key of Object.values(EXTERNAL_PROVIDER_METRIC)) expect(metricKeys.has(key)).toBe(true);
  });

  it('the summary reflects every registered metric without re-listing', () => {
    for (const key of Object.values(ODA_METHOD_METRIC)) incrementMetric(key);
    for (const { metric } of Object.values(ODA_MISS_METRIC)) incrementMetric(metric);
    for (const key of Object.values(EXTERNAL_PROVIDER_METRIC)) incrementMetric(key);

    const { geocodingFallback } = getMetricsSummary();
    for (const label of Object.keys(ODA_METHOD_METRIC)) {
      expect(geocodingFallback.byMethod[label]).toBe(1);
    }
    for (const { label } of Object.values(ODA_MISS_METRIC)) {
      expect(geocodingFallback.missReasons[label]).toBe(1);
    }
    for (const label of Object.keys(EXTERNAL_PROVIDER_METRIC)) {
      expect(geocodingFallback.providers[label]).toBe(1);
    }
  });
});

describe('metrics: window semantics', () => {
  afterEach(() => vi.useRealTimers());

  it('resets lazily on the next write, not on a read', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    resetMetrics();
    incrementMetric('geocodingRequests', 5);

    // A full window passes with no writes.
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);

    // Readers never reset: an idle isolate serves the last window's counters (documented).
    expect(getMetrics().geocodingRequests).toBe(5);
    expect(getMetricsSummary().geocoding.requests).toBe(5);

    // The next write rolls the window and discards the stale counter.
    incrementMetric('geocodingRequests');
    expect(getMetrics().geocodingRequests).toBe(1);
  });
});
