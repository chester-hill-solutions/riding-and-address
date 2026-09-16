import { describe, it, expect, beforeEach } from 'vitest';
import { incrementMetric, getMetricsSummary, resetMetrics } from '../src/metrics';
import { geocodeWithOda } from '../src/oda-geocoding';
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
