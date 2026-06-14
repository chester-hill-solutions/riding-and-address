import { describe, it, expect } from 'vitest';
import { geocodeIfNeeded } from '../src/geocoding';
import { buildGeocodeQueryString, selectGeoGratisResult } from '../src/geocode-region';
import { safeValidateGeoGratis } from '../src/validation';
import { Env } from '../src/types';

const runLive = process.env.GEOCODE_LIVE === '1';

describe.skipIf(!runLive)('live geocoding (GEOCODE_LIVE=1)', () => {
  it('geolocator API returns valid Toronto result', async () => {
    const qp = { address: '757 Victoria Park', city: 'Toronto', state: 'ON' };
    const q = buildGeocodeQueryString(qp);
    const url = `https://www.geolocator.api.geo.ca/geolocation/en/locate?q=${encodeURIComponent(q)}&expand=score,component`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'riding-lookup/1.0' } });
    expect(resp.ok).toBe(true);
    const raw = await resp.json();
    const validation = safeValidateGeoGratis(raw);
    expect(validation.success).toBe(true);
    const selected = selectGeoGratisResult(qp, validation.success ? validation.data : []);
    expect(selected?.title).toContain('Toronto');
  });

  it('resolves 757 Victoria Park, Toronto via GeoGratis before Google', async () => {
    const env: Env = {
      RIDINGS: {} as R2Bucket,
      ODA_GEOCODING_ENABLED: 'false',
    };

    const result = await geocodeIfNeeded(env, {
      address: '757 Victoria Park',
      city: 'Toronto',
      state: 'ON',
    });

    expect(result.lat).toBeGreaterThan(43.68);
    expect(result.lat).toBeLessThan(43.71);
    expect(result.lon).toBeGreaterThan(-79.31);
    expect(result.lon).toBeLessThan(-79.27);
  }, 15000);
});

describe('live geocoder placeholder', () => {
  it('skips live tests unless GEOCODE_LIVE=1', () => {
    expect(true).toBe(true);
  });
});
