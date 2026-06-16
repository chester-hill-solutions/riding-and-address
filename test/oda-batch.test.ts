import { describe, it, expect } from 'vitest';
import { geocodeBatchWithOda } from '../src/oda-geocoding';
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

describe('geocodeBatchWithOda', () => {
  it('geocodes multiple addresses including unit and Victoria Park', async () => {
    const results = await geocodeBatchWithOda(odaEnv(), [
      { address: '123 Main St', city: 'Toronto', state: 'ON' },
      { address: 'Unit 1205, 123 Main St', city: 'Toronto', state: 'ON' },
      { address: '757 Victoria Park', city: 'Toronto', state: 'ON' },
      { postal: 'M5V2T6', state: 'ON' },
    ]);

    expect(results).toHaveLength(4);
    expect(results[0].success).toBe(true);
    expect(results[0].geocodeMethod).toBe('exact');
    expect(results[1].success).toBe(true);
    expect(results[1].geocodeMethod).toBe('exact');
    expect(results[2].success).toBe(true);
    expect(results[3].success).toBe(true);
    expect(results[3].geocodeMethod).toBe('postal_centroid');
  });

  it('returns failures for missing addresses without tripping circuit breaker', async () => {
    const results = await geocodeBatchWithOda(odaEnv(), [
      { address: '999 Nonexistent Blvd', city: 'Toronto', state: 'ON' },
    ]);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('not found');
  });
});
