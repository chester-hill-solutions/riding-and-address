import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { normalizeStreetType, parseAddressQuery } from '../src/oda-normalize';
import { geocodeWithOda } from '../src/oda-geocoding';
import { createOdaFixtureEnv } from './helpers/oda-memory-db';
import { Env } from '../src/types';

function typesEnv(): Env {
  const { d1 } = createOdaFixtureEnv(
    join(process.cwd(), 'test/fixtures/oda/fixture-street-types.csv')
  );
  return {
    RIDINGS: {} as R2Bucket,
    ODA_DB: d1,
    ODA_GEOCODING_ENABLED: 'true',
    ODA_PROVINCES: 'ON',
    ODA_MIN_CONFIDENCE: '0.6',
  };
}

describe('normalizeStreetType', () => {
  // These guard the 10M rows already in D1: their search_key was built with this table,
  // so changing any of these outputs would strand the data behind an unmatchable key.
  it('keeps canonical mappings stable', () => {
    expect(normalizeStreetType('Drive')).toBe('DR');
    expect(normalizeStreetType('Court')).toBe('CRT');
    expect(normalizeStreetType('Av')).toBe('AVE');
    expect(normalizeStreetType('Street')).toBe('ST');
    expect(normalizeStreetType('Boulevard')).toBe('BLVD');
  });

  it('maps verbatim types to themselves, matching how they were imported', () => {
    for (const type of ['CT', 'MALL', 'LANE', 'WAY', 'CIR', 'TRAIL', 'PARK', 'BAY', 'HTS']) {
      expect(normalizeStreetType(type)).toBe(type);
    }
  });

  it('leaves an unknown type untouched rather than inventing a mapping', () => {
    expect(normalizeStreetType('ZZZNOTATYPE')).toBe('ZZZNOTATYPE');
  });
});

describe('parseAddressQuery street-type recognition', () => {
  const cases: Array<[string, string, string]> = [
    ['1 Leeds Ct', 'LEEDS', 'CT'],
    ['21 West Mall', 'WEST', 'MALL'],
    ['1151 Laura Lane', 'LAURA', 'LANE'],
    ['1423 Cousineau Cir', 'COUSINEAU', 'CIR'],
    ['4597 Timber Trail', 'TIMBER', 'TRAIL'],
    ['1 Foo Pvt', 'FOO', 'PVT'],
    ['1 Bar Sq', 'BAR', 'SQ'],
    // Canonicalising types must keep working.
    ['4749 Riverside Drive', 'RIVERSIDE', 'DR'],
    ['1570 Traxler Court', 'TRAXLER', 'CRT'],
  ];

  for (const [address, expectedName, expectedType] of cases) {
    it(`splits "${address}" into name and type`, () => {
      const parsed = parseAddressQuery({ address, city: 'Windsor', state: 'ON' });
      expect(parsed.streetName).toBe(expectedName);
      expect(parsed.streetType).toBe(expectedType);
    });
  }

  it('still parses a trailing direction after a newly recognised type', () => {
    const parsed = parseAddressQuery({ address: '100 Queen Mall W', city: 'Toronto', state: 'ON' });
    expect(parsed.streetName).toBe('QUEEN');
    expect(parsed.streetType).toBe('MALL');
    expect(parsed.streetDirection).toBe('W');
  });
});

describe('ODA geocoding with the full street-type vocabulary', () => {
  it('resolves the reported CT failure', async () => {
    const result = await geocodeWithOda(typesEnv(), {
      address: '1 Leeds Ct',
      city: 'Bracebridge',
      state: 'ON',
    });
    expect(result.geocodeMethod).toBe('exact');
    expect(result.lat).toBeCloseTo(45.03127, 4);
  });

  it('resolves the reported MALL failure', async () => {
    const result = await geocodeWithOda(typesEnv(), {
      address: '21 West Mall',
      city: 'Toronto',
      state: 'ON',
    });
    expect(result.geocodeMethod).toBe('exact');
    expect(result.lat).toBeCloseTo(43.63116, 4);
  });

  it.each([
    ['1151 Laura Lane', 'Windsor', 42.29],
    ['1423 Cousineau Cir', 'Windsor', 42.26],
    ['1077 Thurso Way', 'Windsor', 42.3],
    ['4597 Timber Trail', 'Windsor', 42.25],
  ])('resolves %s', async (address, city, lat) => {
    const result = await geocodeWithOda(typesEnv(), { address, city, state: 'ON' });
    expect(result.geocodeMethod).toBe('exact');
    expect(result.lat).toBeCloseTo(lat, 4);
  });

  it('resolves a name the caller prefixes with the article ODA drops', async () => {
    // ODA stores 399|WEST|MALL: no Ontario street name begins with "THE".
    const result = await geocodeWithOda(typesEnv(), {
      address: '399 The West Mall',
      city: 'Toronto',
      state: 'ON',
    });
    expect(result.geocodeMethod).toBe('exact');
    expect(result.lat).toBeCloseTo(43.63116, 4);
  });

  it('resolves a name that merely ends in a street-type word', async () => {
    // "RAVINE PARK" is stored as the street name with no type. Recognising PARK as a
    // type must not strand this row: the second reading of the tail catches it.
    const result = await geocodeWithOda(typesEnv(), {
      address: '4 Ravine Park',
      city: 'Norfolk',
      state: 'ON',
    });
    expect(result.geocodeMethod).toBe('exact');
    expect(result.lat).toBeCloseTo(42.84, 4);
  });

  it('resolves types that canonicalise on import', async () => {
    const drive = await geocodeWithOda(typesEnv(), {
      address: '4749 Riverside Drive',
      city: 'St Clair',
      state: 'ON',
    });
    expect(drive.lat).toBeCloseTo(42.31, 4);

    const court = await geocodeWithOda(typesEnv(), {
      address: '1570 Traxler Court',
      city: 'St Clair',
      state: 'ON',
    });
    expect(court.lat).toBeCloseTo(42.32, 4);

    const av = await geocodeWithOda(typesEnv(), {
      address: '3 Woodstock Ave',
      city: 'Norfolk',
      state: 'ON',
    });
    expect(av.lat).toBeCloseTo(42.85, 4);
  });
});

describe('D1 bound-parameter budget', () => {
  // D1 rejects a statement with too many bound variables. City aliases and street-tail
  // readings multiply, and "399 The West Mall" in Toronto is the worst case in the data:
  // it once produced ~205 parameters and failed live with "too many SQL variables", which
  // no fixture-backed test caught. Keep the ceiling honest.
  function countingEnv(seen: number[]): Env {
    const { d1 } = createOdaFixtureEnv(
      join(process.cwd(), 'test/fixtures/oda/fixture-street-types.csv')
    );
    const spy = {
      prepare: (sql: string) => {
        const inner = (d1 as unknown as { prepare: (s: string) => unknown }).prepare(sql) as {
          bind: (...p: unknown[]) => unknown;
        };
        return {
          bind: (...params: unknown[]) => {
            seen.push(params.length);
            return inner.bind(...params);
          },
        };
      },
    } as unknown as D1Database;
    return {
      RIDINGS: {} as R2Bucket,
      ODA_DB: spy,
      ODA_GEOCODING_ENABLED: 'true',
      ODA_PROVINCES: 'ON',
      ODA_MIN_CONFIDENCE: '0.6',
    };
  }

  it('stays within a safe parameter count for the worst-case query', async () => {
    const seen: number[] = [];
    await geocodeWithOda(countingEnv(seen), {
      address: '399 The West Mall',
      city: 'Toronto',
      state: 'ON',
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(Math.max(...seen)).toBeLessThanOrEqual(100);
  });
});
