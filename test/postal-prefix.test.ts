import { describe, expect, it } from 'vitest';
import { geocodeWithOda, geocodePostalCentroidWithOda, geocodeBatchPostalCentroidsWithOda } from '../src/oda-geocoding';
import { geocodeBatch } from '../src/geocoding';
import { createOdaFixtureEnv } from './helpers/oda-sqlite';
import { createLookupTestEnv, fetchLookup } from './helpers/lookup-test-env';

function fixture() {
  const data = createOdaFixtureEnv();
  data.sqlite.exec(`
    DELETE FROM oda_postal_centroids WHERE postal_code='M5V 2T6';
    INSERT INTO oda_postal_centroids VALUES ('ON','M5V 2T3',43.643622,-79.404366,16);
    INSERT INTO oda_postal_centroids VALUES ('ON','M5V 2T8',43.645719,-79.398984,103);
  `);
  const env = { ...createLookupTestEnv(), ODA_DB: data.d1, ODA_GEOCODING_ENABLED: 'true', ODA_PROVINCES: 'ON,QC' };
  return { ...data, env };
}

const expectedMatch = {
  requestedPostalCode: 'M5V 2T6',
  matchedPrefix: 'M5V 2T',
  matchedPostalCodes: ['M5V 2T3', 'M5V 2T8'],
};

describe('postal prefix approximation', () => {
  it.each(['M5V2T6', 'M5V 2T6'])('approximates %s from sibling postal centroids', async (postal) => {
    const data = fixture();
    try {
      const result = await geocodeWithOda(data.env, { postal, state: 'ON' });
      expect(result).toMatchObject({ geocodeMethod: 'postal_prefix', confidence: 0.65, matchedFields: ['postal_prefix'], postalMatch: expectedMatch });
      expect(result.lat).toBeCloseTo((43.643622 * 16 + 43.645719 * 103) / 119, 6);
      expect(result.lon).toBeCloseTo((-79.404366 * 16 - 79.398984 * 103) / 119, 6);
      expect(result.addressComponents?.postal_code).toBeUndefined();
      expect(result.mailingAddress?.postalCode).toBeUndefined();
    } finally { data.close(); }
  });

  it('still prefers an exact centroid', async () => {
    const data = fixture();
    try {
      data.sqlite.exec("INSERT INTO oda_postal_centroids VALUES ('ON','M5V 2T6',43.65,-79.4,1)");
      expect(await geocodeWithOda(data.env, { postal: 'M5V2T6', state: 'ON' })).toMatchObject({ geocodeMethod: 'postal_centroid', confidence: 0.85, lat: 43.65, lon: -79.4 });
    } finally { data.close(); }
  });

  it('keeps explicit postal_centroid mode exact', async () => {
    const data = fixture();
    try {
      await expect(geocodePostalCentroidWithOda(data.env, { postal: 'M5V2T6', state: 'ON', geocodeMethod: 'postal_centroid' })).rejects.toMatchObject({ code: 'ADDRESS_NOT_FOUND' });
      expect(await geocodePostalCentroidWithOda(data.env, { postal: 'M5V2T6', state: 'ON' })).toMatchObject({ geocodeMethod: 'postal_prefix' });
    } finally { data.close(); }
  });

  it('does not broaden beyond the first five characters or cross provinces', async () => {
    const data = fixture();
    try {
      for (const query of [{ postal: 'M5V2X1', state: 'ON' }, { postal: 'M5V2T6', state: 'QC' }]) {
        await expect(geocodeWithOda(data.env, query)).rejects.toMatchObject({ code: 'ADDRESS_NOT_FOUND' });
      }
    } finally { data.close(); }
  });

  it('honors the confidence threshold', async () => {
    const data = fixture();
    try {
      await expect(geocodeWithOda({ ...data.env, ODA_MIN_CONFIDENCE: '0.8' }, { postal: 'M5V2T6', state: 'ON' })).rejects.toMatchObject({ code: 'LOW_CONFIDENCE_GEOCODE' });
    } finally { data.close(); }
  });

  it('rejects a geographically scattered prefix', async () => {
    const data = fixture();
    try {
      data.sqlite.exec("UPDATE oda_postal_centroids SET lat=46 WHERE postal_code='M5V 2T8'");
      await expect(geocodeWithOda(data.env, { postal: 'M5V2T6', state: 'ON' })).rejects.toMatchObject({ code: 'ADDRESS_NOT_FOUND' });
    } finally { data.close(); }
  });

  it('preserves match details in batch results and keeps strict queries separate', async () => {
    const data = fixture();
    try {
      const query = { postal: 'M5V2T6', state: 'ON' };
      const results = await geocodeBatch(data.env, [query]);
      expect(results[0]).toMatchObject({ success: true, geocodeMethod: 'postal_prefix', postalMatch: expectedMatch });
      const grouped = await geocodeBatchPostalCentroidsWithOda(data.env, [
        query, { ...query, geocodeMethod: 'postal_centroid' }, { ...query, state: 'QC' },
      ]);
      expect(grouped.map((row) => row.success)).toEqual([true, false, false]);
    } finally { data.close(); }
  });

  it('exposes approximation through geocoding and cached riding responses', async () => {
    const data = fixture();
    try {
      const response = await fetchLookup(data.env, '/api/demo/geocode?postal=M5V2T6&province=ON');
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ geocodeMethod: 'postal_prefix', confidence: 0.65, postalMatch: expectedMatch });
      const strict = await fetchLookup(data.env, '/api/demo/geocode?postal=M5V2T6&province=ON&geocode_method=postal_centroid');
      expect(strict.status).toBe(404);
      for (let i = 0; i < 2; i++) {
        const lookup = await fetchLookup(data.env, '/api/demo/federal?postal=M5V2T6&province=ON');
        expect(lookup.status).toBe(200);
        expect(await lookup.json()).toMatchObject({ geocode: { method: 'postal_prefix', confidence: 0.65, postalMatch: expectedMatch } });
      }
    } finally { data.close(); }
  });
});
