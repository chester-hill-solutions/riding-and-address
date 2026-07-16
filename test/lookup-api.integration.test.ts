import { describe, it, expect, beforeEach } from 'vitest';
import { geoCacheLRU, spatialIndexCacheLRU } from '../src/cache';
import {
  createLookupTestEnv,
  fetchLookup,
  TORONTO_LAT,
  TORONTO_LON,
  VICTORIA_PARK_LAT,
  VICTORIA_PARK_LON,
  buildVictoriaParkGeoJson,
} from './helpers/lookup-test-env';

describe('lookup API integration (PR manual test plan)', () => {
  beforeEach(() => {
    geoCacheLRU.clear();
    spatialIndexCacheLRU.clear();
  });

  it('GET /api/combined returns province_data for Ontario coordinates', async () => {
    const env = createLookupTestEnv();
    const response = await fetchLookup(
      env,
      `/api/combined?lat=${TORONTO_LAT}&lon=${TORONTO_LON}`
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      province_data?: { riding: string; properties: Record<string, unknown> };
      query: { includeProvince?: boolean };
    };

    expect(body.query.includeProvince).toBe(true);
    expect(body.province_data).not.toBeNull();
    expect(body.province_data?.riding).toBe('Toronto Centre');
    expect(body.province_data?.properties?.PR_NUM).toBe('082');
  });

  it('GET /api/federal?include_province=true returns province_data', async () => {
    const env = createLookupTestEnv();
    const response = await fetchLookup(
      env,
      `/api/federal?lat=${TORONTO_LAT}&lon=${TORONTO_LON}&include_province=true`
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      province_data?: { riding: string; properties: Record<string, unknown> };
      query: { includeProvince?: boolean };
    };

    expect(body.query.includeProvince).toBe(true);
    expect(body.province_data).not.toBeNull();
    expect(body.province_data?.riding).toBe('Toronto Centre');
  });

  it('GET /api/federal?return=municipality returns municipality and properties.MUNICIPALITY', async () => {
    const env = createLookupTestEnv();
    const response = await fetchLookup(
      env,
      `/api/federal?lat=${TORONTO_LAT}&lon=${TORONTO_LON}&return=municipality&city=Toronto`
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      municipality?: string;
      properties?: { MUNICIPALITY?: string; ED_NAMEE?: string };
      query: { returnFields?: string[] };
    };

    expect(body.query.returnFields).toEqual(['municipality']);
    expect(body.municipality).toBe('Toronto');
    expect(body.properties?.MUNICIPALITY).toBe('Toronto');
    expect(body.properties?.ED_NAMEE).toBe('Spadina—Harbourfront');
  });

  it('does not include province_data when return=municipality filters combined defaults', async () => {
    const env = createLookupTestEnv();
    const response = await fetchLookup(
      env,
      `/api/combined?lat=${TORONTO_LAT}&lon=${TORONTO_LON}&return=municipality&city=Toronto`
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      municipality?: string;
      province_data?: { riding: string } | null;
      query: { includeProvince?: boolean; returnFields?: string[] };
    };

    expect(body.query.returnFields).toEqual(['municipality']);
    expect(body.query.includeProvince).toBe(false);
    expect(body.municipality).toBe('Toronto');
    expect(body.province_data).toBeUndefined();
  });

  it('POST /batch supports include_province and return fields', async () => {
    // /batch falls back to operator BASIC_AUTH when API keys are off; auth now fails closed,
    // so the test must present real credentials instead of relying on an unset secret.
    const env = { ...createLookupTestEnv(), BASIC_AUTH: 'admin:secret' };
    const response = await fetchLookup(env, '/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${btoa('admin:secret')}`,
      },
      body: JSON.stringify({
        requests: [
          {
            id: 'combined-municipality',
            pathname: '/api/combined',
            query: {
              lat: TORONTO_LAT,
              lon: TORONTO_LON,
              return: 'municipality',
              city: 'Toronto',
            },
          },
          {
            id: 'federal-province',
            pathname: '/api/federal',
            query: {
              lat: TORONTO_LAT,
              lon: TORONTO_LON,
              include_province: 'true',
            },
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      results: Array<{
        id: string;
        municipality?: string;
        properties?: { MUNICIPALITY?: string };
        province_data?: { riding: string } | null;
        query: { includeProvince?: boolean; returnFields?: string[] };
      }>;
    };

    expect(body.results).toHaveLength(2);

    const combined = body.results.find((r) => r.id === 'combined-municipality');
    expect(combined?.query.includeProvince).toBe(false);
    expect(combined?.query.returnFields).toEqual(['municipality']);
    expect(combined?.municipality).toBe('Toronto');
    expect(combined?.properties?.MUNICIPALITY).toBe('Toronto');
    expect(combined?.province_data).toBeUndefined();

    const federal = body.results.find((r) => r.id === 'federal-province');
    expect(federal?.query.includeProvince).toBe(true);
    expect(federal?.province_data?.riding).toBe('Toronto Centre');
  });

  it('Victoria Park returns Scarborough Southwest, not Beaches—East York (issue #11)', async () => {
    const env = createLookupTestEnv(buildVictoriaParkGeoJson());
    const response = await fetchLookup(
      env,
      `/api/combined?lat=${VICTORIA_PARK_LAT}&lon=${VICTORIA_PARK_LON}&include_province=true`
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      province_data?: { riding: string; properties: Record<string, unknown> };
      properties?: { ED_NAMEE?: string };
    };

    expect(body.province_data?.riding).toBe('Scarborough Southwest');
    expect(body.province_data?.riding).not.toBe('Beaches—East York');
    expect(body.province_data?.properties?.ENGLISH_NA).toBe('Scarborough Southwest');
    expect(body.properties?.ED_NAMEE).toBe('Scarborough Southwest');
  });
});
