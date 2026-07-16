import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geocodeWithOda, reverseGeocodeWithOda, OdaGeocodeError } from '../src/oda-geocoding';
import { Env } from '../src/types';

type MockRow = Record<string, unknown>;

function createMockD1(responses: {
  first?: MockRow | null;
  all?: MockRow[];
}[]) {
  let callIndex = 0;
  const prepare = vi.fn(() => {
    const response = responses[callIndex] ?? { first: null, all: [] };
    callIndex++;
    return {
      bind: vi.fn(() => ({
        first: vi.fn(async () => response.first ?? null),
        all: vi.fn(async () => ({ results: response.all ?? [] })),
      })),
    };
  });

  return { prepare, batch: vi.fn(async () => ({})) } as unknown as D1Database;
}

function createOdaEnv(db: D1Database): Env {
  return {
    RIDINGS: {} as R2Bucket,
    ODA_DB: db,
    ODA_GEOCODING_ENABLED: 'true',
    ODA_PROVINCES: 'ON,QC',
    ODA_MIN_CONFIDENCE: '0.6',
  };
}

describe('geocodeWithOda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns exact match result', async () => {
    // The exact-match query selects all candidate city spellings and ranks them, so it
    // reads via all(); search_key must be present for the caller's own spelling to win.
    const db = createMockD1([
      {
        all: [
          {
            id: 1,
            province: 'ON',
            civic_number: '123',
            street_name: 'MAIN',
            street_type: 'ST',
            street_direction: '',
            unit: '',
            postal_code: 'M5V 2T6',
            city: 'Toronto',
            lat: 43.6532,
            lon: -79.3832,
            full_address: '123 Main St, Toronto ON',
            search_key: '123|MAIN|ST||TORONTO|ON',
          },
        ],
      },
    ]);

    const result = await geocodeWithOda(createOdaEnv(db), {
      address: '123 Main St',
      city: 'Toronto',
      state: 'ON',
    });

    expect(result.geocodeMethod).toBe('exact');
    expect(result.confidence).toBe(1);
    expect(result.lat).toBe(43.6532);
    expect(result.mailingAddress?.canadaPostCertified).toBe(false);
  });

  it('returns postal centroid when postal only', async () => {
    const db = createMockD1([
      { first: null },
      {
        first: {
          province: 'ON',
          postal_code: 'M5V 2T6',
          lat: 43.65,
          lon: -79.38,
        },
      },
    ]);

    const result = await geocodeWithOda(createOdaEnv(db), { postal: 'M5V2T6', state: 'ON' });
    expect(result.geocodeMethod).toBe('postal_centroid');
    expect(result.confidence).toBe(0.85);
  });

  it('refuses ambiguous street-only queries', async () => {
    const db = createMockD1([]);
    await expect(
      geocodeWithOda(createOdaEnv(db), { address: 'Main Street' })
    ).rejects.toMatchObject({ code: 'AMBIGUOUS_LOCATION', status: 422 });
  });

  it('throws PROVINCE_NOT_LOADED for unloaded province', async () => {
    const db = createMockD1([]);
    await expect(
      geocodeWithOda(createOdaEnv(db), { postal: 'V6B1A1', state: 'BC' })
    ).rejects.toMatchObject({ code: 'PROVINCE_NOT_LOADED', status: 404 });
  });
});

describe('reverseGeocodeWithOda', () => {
  it('returns nearest address with distance', async () => {
    const db = createMockD1([
      {
        all: [
          {
            id: 1,
            province: 'ON',
            civic_number: '123',
            street_name: 'MAIN',
            street_type: 'ST',
            street_direction: '',
            unit: '',
            postal_code: 'M5V 2T6',
            city: 'Toronto',
            lat: 43.6532,
            lon: -79.3832,
            full_address: '123 Main St',
          },
        ],
      },
    ]);

    const result = await reverseGeocodeWithOda(createOdaEnv(db), 43.6532, -79.3832);
    expect(result.geocodeMethod).toBe('nearest_neighbor');
    expect(result.distanceMeters).toBe(0);
    expect(result.mailingAddress).toBeDefined();
  });

  it('throws NO_NEARBY_ADDRESS when no candidates', async () => {
    const db = createMockD1([{ all: [] }, { all: [] }, { all: [] }, { all: [] }]);
    await expect(reverseGeocodeWithOda(createOdaEnv(db), 0, 0)).rejects.toMatchObject({
      code: 'NO_NEARBY_ADDRESS',
    });
  });
});

describe('OdaGeocodeError', () => {
  it('carries code and status', () => {
    const error = new OdaGeocodeError('test', 'TEST_CODE', 422);
    expect(error.code).toBe('TEST_CODE');
    expect(error.status).toBe(422);
  });
});
