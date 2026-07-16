import { describe, it, expect, vi } from 'vitest';
import { handleLookupRequest } from '../src/lookup-handler';
import { Env } from '../src/types';

describe('dataset pin', () => {
  it('returns DATASET_UNAVAILABLE when pin does not match current vintage', async () => {
    const env = {} as Env;
    const response = await handleLookupRequest(
      new Request('https://x.test/api/federal?lat=45&lon=-75&dataset=federalridings-2015.geojson'),
      env,
      '/api/federal',
      async () => ({ properties: null }),
      'corr',
      Date.now(),
      () => ({}),
      undefined,
      null
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('DATASET_UNAVAILABLE');
  });

  it('allows a matching year pin', async () => {
    const lookup = vi.fn(async () => ({
      properties: { FED_NAME: 'Test' },
      riding: 'Test',
      point: { lon: -75, lat: 45 },
      cacheStatus: 'MISS' as const,
    }));
    // performExpandedLookup path — stub via throwing early is hard; call with coords and mock expansion.
    // Here we only assert pin validation passes into the lookup try path without 404.
    const env = {} as Env;
    const response = await handleLookupRequest(
      new Request('https://x.test/api/federal?lat=45&lon=-75&dataset=2024'),
      env,
      '/api/federal',
      async () => ({ properties: { FED_NAME: 'Test' }, riding: 'Test' }),
      'corr',
      Date.now(),
      () => ({}),
      undefined,
      null
    );
    // May 500 if expansion needs more env; must not be DATASET_UNAVAILABLE.
    if (response.status === 404) {
      const body = (await response.json()) as { code: string };
      expect(body.code).not.toBe('DATASET_UNAVAILABLE');
    } else {
      expect(response.status).not.toBe(404);
    }
    void lookup;
  });
});
