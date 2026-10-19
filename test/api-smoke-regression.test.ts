import { beforeEach, describe, expect, it } from 'vitest';
import { geoCacheLRU, spatialIndexCacheLRU } from '../src/dataset-cache';
import { createLookupTestEnv, fetchLookup } from './helpers/lookup-test-env';
import { createOdaFixtureEnv } from './helpers/oda-sqlite';

interface LookupBody {
  query: { includeProvince?: boolean };
  province_data?: { riding?: string };
  addressComponents?: { unit?: string };
  normalizedAddress?: string;
  mailingAddress: { line1?: string };
}

const point = 'lat=43.6426&lon=-79.3871';

describe('live API regressions', () => {
  beforeEach(() => {
    geoCacheLRU.clear();
    spatialIndexCacheLRU.clear();
  });

  it('applies combined defaults through the public demo wrapper', async () => {
    const response = await fetchLookup(createLookupTestEnv(), `/api/demo/combined?${point}`);
    expect(response.status).toBe(200);
    const body = await response.json() as LookupBody;
    expect(body.query.includeProvince).toBe(true);
    expect(body.province_data?.riding).toBe('Toronto Centre');
  });

  it.each(['include_province=false', 'return=municipality&city=Toronto'])(
    'keeps the combined demo override %s',
    async (selector) => {
      const response = await fetchLookup(createLookupTestEnv(), `/api/demo/combined?${point}&${selector}`);
      expect(response.status).toBe(200);
      const body = await response.json() as LookupBody;
      expect(body.query.includeProvince).toBe(false);
      expect(body.province_data).toBeUndefined();
    }
  );

  it.each(['/api/demo/garbage', '/api/demo/on/garbage', '/api/demo/search', '/api/garbage'])(
    'rejects unknown lookup path %s',
    async (path) => {
      const response = await fetchLookup(createLookupTestEnv(), `${path}?${point}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' });
    }
  );

  it('keeps provincial demo lookups available', async () => {
    const response = await fetchLookup(createLookupTestEnv(), `/api/demo/on?${point}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ riding: 'Toronto Centre' });
  });

  it.each(['350 Rue Saint-Paul E', '350 Saint-Paul RUE E'])(
    'geocodes French address %s through the demo endpoint',
    async (address) => {
      const fixture = createOdaFixtureEnv();
      try {
        const env = { ...createLookupTestEnv(), ODA_DB: fixture.d1, ODA_GEOCODING_ENABLED: 'true', ODA_PROVINCES: 'ON,QC' };
        const params = new URLSearchParams({ address, city: 'Montréal', province: 'QC' });
        const response = await fetchLookup(env, `/api/demo/geocode?${params}`);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ geocodeMethod: 'exact', point: { lat: 45.5088, lon: -73.554 } });
      } finally {
        fixture.close();
      }
    }
  );

  it.each(['/api/demo/geocode', '/api/demo/normalize-address'])(
    'does not choose an apartment for a building-only request to %s',
    async (path) => {
      const fixture = createOdaFixtureEnv();
      try {
        fixture.sqlite.exec("UPDATE oda_addresses SET unit='PH11' WHERE civic_number='757'");
        const env = { ...createLookupTestEnv(), ODA_DB: fixture.d1, ODA_GEOCODING_ENABLED: 'true', ODA_PROVINCES: 'ON' };
        const params = new URLSearchParams({ address: '757 Victoria Park Ave', city: 'Toronto', province: 'ON' });
        const response = await fetchLookup(env, `${path}?${params}`);
        expect(response.status).toBe(200);
        const body = await response.json() as LookupBody;
        expect(body.addressComponents?.unit).toBeUndefined();
        expect(body.normalizedAddress).not.toContain('PH11');
        expect(body.mailingAddress.line1).toBe('757 VICTORIA PARK AVE');
      } finally {
        fixture.close();
      }
    }
  );

  it('preserves an explicitly requested apartment', async () => {
    const fixture = createOdaFixtureEnv();
    try {
      fixture.sqlite.exec("UPDATE oda_addresses SET unit='PH11' WHERE civic_number='757'");
      const env = { ...createLookupTestEnv(), ODA_DB: fixture.d1, ODA_GEOCODING_ENABLED: 'true', ODA_PROVINCES: 'ON' };
      const params = new URLSearchParams({ address: '757 Victoria Park Ave Unit PH11', city: 'Toronto', province: 'ON' });
      const response = await fetchLookup(env, `/api/demo/geocode?${params}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ addressComponents: { unit: 'PH11' } });
    } finally {
      fixture.close();
    }
  });
});
