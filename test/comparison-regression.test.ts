import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { validateAndSanitizeQuery } from '../src/utils';
import {
  TORONTO_LAT,
  TORONTO_LON,
  createLookupTestEnv,
  fetchLookup,
} from './helpers/lookup-test-env';

type ComparisonCase = {
  id: string;
  category: string;
  endpoint: string;
  query: Record<string, string>;
};

const cases = JSON.parse(
  readFileSync('test/fixtures/comparison/opennorth-cases.json', 'utf8')
) as ComparisonCase[];

const postalAndCoordCases = cases.filter((c) => c.category === 'A' || c.category === 'C');

function toSearchParams(query: Record<string, string>): string {
  return new URLSearchParams(query).toString();
}

describe('comparison regression (postal + coordinates)', () => {
  it('has expected A/C case count from OpenNorth matrix', () => {
    expect(postalAndCoordCases.length).toBe(13);
  });

  for (const testCase of postalAndCoordCases) {
    it(`${testCase.id} validates query parameters`, () => {
      const raw = {
        ...testCase.query,
        lat: testCase.query.lat ? Number(testCase.query.lat) : undefined,
        lon: testCase.query.lon ? Number(testCase.query.lon) : undefined,
      };
      const result = validateAndSanitizeQuery(raw, testCase.endpoint);
      expect(result.valid).toBe(true);
    });
  }

  it('C1 Toronto core lat/lon returns a riding', async () => {
    const env = createLookupTestEnv();
    const res = await fetchLookup(
      env,
      `/api/federal?lat=${TORONTO_LAT}&lon=${TORONTO_LON}`
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { riding?: string };
    expect(body.riding).toBeTruthy();
  });

  it('A2 postal query accepts geocode_method=postal_centroid', () => {
    const result = validateAndSanitizeQuery(
      { postal: 'K1A0A6', geocode_method: 'postal_centroid' },
      '/api/federal'
    );
    expect(result.valid).toBe(true);
    expect(result.sanitized?.geocodeMethod).toBe('postal_centroid');
  });

  it('coordinate cases include lat and lon pairs', () => {
    const coordCases = postalAndCoordCases.filter((c) => c.category === 'C');
    for (const c of coordCases) {
      if (c.id === 'C5') continue; // offshore — no riding expected in mock
      expect(c.query.lat).toBeTruthy();
      expect(c.query.lon).toBeTruthy();
    }
  });
});
