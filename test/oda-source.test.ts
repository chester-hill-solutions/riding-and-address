import { describe, it, expect, vi } from 'vitest';
import { resolveNarVersion, withCitySource } from '../src/oda-source';
import type { Env } from '../src/types';
import type { OdaGeocodeResult } from '../src/oda-geocoding';

function envWithDb(first: () => unknown): Env {
  return {
    RIDINGS: {} as R2Bucket,
    ODA_DB: {
      prepare: () => ({ bind: () => ({ first }) }),
    } as unknown as D1Database,
  } as Env;
}

const baseResult: OdaGeocodeResult = {
  lat: 43.7,
  lon: -79.3,
  geocodeMethod: 'exact',
  confidence: 1,
  dataSource: { provider: 'statcan-oda', version: '2021001', province: 'ON', canadaPostCertified: false },
};

describe('oda-source provenance', () => {
  it('reports the NAR vintage for a refreshed city', async () => {
    const first = vi.fn(async () => ({ nar_version: '202606' }));
    const env = envWithDb(first);
    expect(await resolveNarVersion(env, 'ON', 'TORONTO|ON')).toBe('202606');
  });

  it('treats a missing table or no row as ODA-sourced', async () => {
    const env = envWithDb(async () => {
      throw new Error('no such table: nar_city_keys');
    });
    expect(await resolveNarVersion(env, 'ON', 'MISSISSAUGA|ON')).toBeUndefined();
  });

  it('restamps the provider and version on the result', async () => {
    const env = envWithDb(async () => ({ nar_version: '202606' }));
    const result = await withCitySource(env, baseResult, 'Toronto', 'ON');
    expect(result.dataSource).toMatchObject({ provider: 'statcan-nar', version: '202606' });
  });

  it('leaves an ODA city untouched', async () => {
    const env = envWithDb(async () => null);
    const result = await withCitySource(env, baseResult, 'Mississauga', 'ON');
    expect(result.dataSource?.provider).toBe('statcan-oda');
  });
});
