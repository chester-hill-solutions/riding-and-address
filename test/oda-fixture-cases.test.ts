import { describe, it, expect } from 'vitest';
import { geocodeWithOda, reverseGeocodeWithOda, OdaGeocodeError } from '../src/oda-geocoding';
import { SUPPORTED_ODA_PROVINCES } from '../src/oda-import';
import type { Env, QueryParams } from '../src/types';
import { createOdaFixtureEnv } from './helpers/oda-memory-db';

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

type GeocodeCase = {
  id: string;
  query: QueryParams;
  expect: {
    geocodeMethod?: string;
    confidence?: number;
    minConfidence?: number;
    lat?: number;
    lon?: number;
    latClose?: number;
    lonClose?: number;
    mailingLine1?: string;
    mailingLine2?: string;
    municipality?: string;
    province?: string;
    postalCode?: string;
    matchedFields?: string[];
    errorCode?: string;
    errorStatus?: number;
  };
};

const FIXTURE_CASES: GeocodeCase[] = [
  {
    id: 'case-1 exact civic (Toronto Main St)',
    query: { address: '123 Main St', city: 'Toronto', state: 'ON' },
    expect: {
      geocodeMethod: 'exact',
      confidence: 1,
      lat: 43.6532,
      lon: -79.3832,
      mailingLine1: '123 MAIN ST',
      province: 'ON',
      matchedFields: ['civic', 'street', 'city', 'province'],
    },
  },
  {
    id: 'case-2 postal centroid',
    query: { postal: 'M5V2T6', state: 'ON' },
    expect: {
      geocodeMethod: 'postal_centroid',
      confidence: 0.85,
      postalCode: 'M5V 2T6',
    },
  },
  {
    id: 'case-4 Montreal accent city',
    query: { address: '350 Saint-Paul RUE E', city: 'Montréal', state: 'QC' },
    expect: {
      geocodeMethod: 'exact',
      municipality: 'MONTREAL',
      province: 'QC',
      latClose: 45.5088,
      lonClose: -73.554,
    },
  },
  {
    id: 'case-5 Ottawa not Toronto duplicate street',
    query: { address: '123 Main St', city: 'Ottawa', state: 'ON' },
    expect: {
      geocodeMethod: 'exact',
      lat: 45.4215,
      lon: -75.6972,
    },
  },
  {
    id: 'case-7 ambiguous street-only',
    query: { address: 'Main Street' },
    expect: { errorCode: 'AMBIGUOUS_LOCATION', errorStatus: 422 },
  },
  {
    id: 'case-8 city-only below confidence (skipped)',
    query: { city: 'Toronto', state: 'ON' },
    expect: { errorCode: 'ADDRESS_NOT_FOUND', errorStatus: 404 },
  },
  {
    id: 'case-9 BC postal centroid',
    query: { postal: 'V6B1A1', state: 'BC' },
    expect: {
      geocodeMethod: 'postal_centroid',
      minConfidence: 0.6,
      province: 'BC',
    },
  },
  {
    id: 'case-9b NL province not on StatCan ODA',
    query: { postal: 'A1C1A1', state: 'NL' },
    expect: { errorCode: 'PROVINCE_NOT_LOADED', errorStatus: 404 },
  },
  {
    id: 'case-3 unit address exact match',
    query: { address: 'Unit 1205, 123 Main St', city: 'Toronto', state: 'ON' },
    expect: {
      geocodeMethod: 'exact',
      mailingLine1: 'UNIT 1205',
      mailingLine2: '123 MAIN ST',
      latClose: 43.6533,
      lonClose: -79.3833,
    },
  },
  {
    id: 'case-12 Victoria Park street match',
    query: { address: '757 Victoria Park', city: 'Toronto', state: 'ON' },
    expect: {
      geocodeMethod: 'exact',
      minConfidence: 0.6,
      latClose: 43.692101,
      lonClose: -79.288688,
    },
  },
  {
    id: 'case-12 Victoria Park Ave exact',
    query: { address: '757 Victoria Park Ave', city: 'Toronto', state: 'ON' },
    expect: {
      geocodeMethod: 'exact',
      latClose: 43.692101,
      lonClose: -79.288688,
    },
  },
  {
    id: 'case-13 Birchmount unit-civic dash',
    query: { address: '901-560 Birchmount Rd', city: 'Toronto', state: 'ON' },
    expect: {
      geocodeMethod: 'exact',
      mailingLine1: 'UNIT 901',
      latClose: 43.709,
      lonClose: -79.264,
    },
  },
  {
    id: 'case-14 street preferred over postal when address present',
    query: { address: '757 Victoria Park Ave', postal: 'M5V2T6', city: 'Toronto', state: 'ON' },
    expect: {
      geocodeMethod: 'exact',
      latClose: 43.692101,
      lonClose: -79.288688,
    },
  },
  {
    id: 'missing address',
    query: { address: '999 Nonexistent Blvd', city: 'Toronto', state: 'ON' },
    expect: { errorCode: 'ADDRESS_NOT_FOUND', errorStatus: 404 },
  },
];

describe('ODA fixture acceptance cases (in-memory D1)', () => {
  for (const testCase of FIXTURE_CASES) {
    it(testCase.id, async () => {
      const { expect: exp } = testCase;

      if (exp.errorCode) {
        await expect(geocodeWithOda(odaEnv(), testCase.query)).rejects.toMatchObject({
          code: exp.errorCode,
          status: exp.errorStatus,
        });
        return;
      }

      const result = await geocodeWithOda(odaEnv(), testCase.query);

      if (exp.geocodeMethod) expect(result.geocodeMethod).toBe(exp.geocodeMethod);
      if (exp.confidence !== undefined) expect(result.confidence).toBe(exp.confidence);
      if (exp.minConfidence !== undefined) {
        expect(result.confidence ?? 0).toBeGreaterThanOrEqual(exp.minConfidence);
      }
      if (exp.lat !== undefined) expect(result.lat).toBe(exp.lat);
      if (exp.lon !== undefined) expect(result.lon).toBe(exp.lon);
      if (exp.latClose !== undefined) expect(result.lat).toBeCloseTo(exp.latClose, 3);
      if (exp.lonClose !== undefined) expect(result.lon).toBeCloseTo(exp.lonClose, 3);
      if (exp.mailingLine1) expect(result.mailingAddress?.line1).toBe(exp.mailingLine1);
      if (exp.mailingLine2) expect(result.mailingAddress?.line2).toBe(exp.mailingLine2);
      if (exp.municipality) expect(result.mailingAddress?.municipality).toBe(exp.municipality);
      if (exp.province) expect(result.mailingAddress?.province).toBe(exp.province);
      if (exp.postalCode) expect(result.mailingAddress?.postalCode).toBe(exp.postalCode);
      if (exp.matchedFields) expect(result.matchedFields).toEqual(expect.arrayContaining(exp.matchedFields));
    });
  }
});

describe('ODA reverse geocode (fixture DB)', () => {
  it('case-6 nearest neighbor at 123 Main Toronto', async () => {
    const result = await reverseGeocodeWithOda(odaEnv(), 43.6532, -79.3832);
    expect(result.geocodeMethod).toBe('nearest_neighbor');
    expect(result.distanceMeters).toBeDefined();
    expect(result.distanceMeters!).toBeLessThanOrEqual(25000);
    expect(result.mailingAddress).toBeDefined();
    expect(result.lat).toBeCloseTo(43.6532, 3);
  });

  it('rejects coordinates with no nearby addresses', async () => {
    await expect(reverseGeocodeWithOda(odaEnv(), 0, 0)).rejects.toMatchObject({
      code: 'NO_NEARBY_ADDRESS',
    });
  });
});

describe('ODA fixture DB coverage summary', () => {
  it('loads all fixture CSV rows into memory', () => {
    const { db } = createOdaFixtureEnv();
    expect(db.addresses.length).toBe(9);
    expect(db.postalCentroids.size).toBeGreaterThan(0);
    expect(db.cityCentroids.size).toBeGreaterThanOrEqual(3);
    expect(db.streetRanges.size).toBeGreaterThan(0);
  });
});

describe('OdaGeocodeError metadata', () => {
  it('exposes code and HTTP status', () => {
    const err = new OdaGeocodeError('msg', 'TEST', 422);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('TEST');
    expect(err.status).toBe(422);
  });
});
