import { describe, it, expect } from 'vitest';
import { geocodeWithOda } from '../src/oda-geocoding';
import { getMetrics, resetMetrics } from '../src/metrics';
import { createOdaFixtureEnv } from './helpers/oda-memory-db';
import { SUPPORTED_ODA_PROVINCES } from '../src/oda-import';
import type { Env } from '../src/types';

const { d1: fixtureD1 } = createOdaFixtureEnv();

function odaEnv(): Env {
  return {
    RIDINGS: {} as R2Bucket,
    ODA_DB: fixtureD1,
    ODA_GEOCODING_ENABLED: 'true',
    ODA_PROVINCES: SUPPORTED_ODA_PROVINCES.join(','),
    ODA_MIN_CONFIDENCE: '0.6',
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
