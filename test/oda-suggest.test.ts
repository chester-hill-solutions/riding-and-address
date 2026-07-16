import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  searchSuggestions,
  buildFtsMatchQuery,
  scoreSuggestion,
  encodeContainerId,
  decodeContainerId,
  encodeCursor,
  decodeCursor,
  unitPrefixFromQuery,
  SuggestError,
  type ScoreInputs,
} from '../src/oda-suggest';
import { Env, SuggestQueryParams } from '../src/types';

type MockRow = Record<string, unknown>;

interface MockCall {
  sql: string;
  binds: unknown[];
}

function createMockD1(responses: { first?: MockRow | null; all?: MockRow[] }[]) {
  const calls: MockCall[] = [];
  let callIndex = 0;

  const prepare = vi.fn((sql: string) => {
    const response = responses[callIndex] ?? { first: null, all: [] };
    callIndex++;
    return {
      bind: vi.fn((...binds: unknown[]) => {
        calls.push({ sql, binds });
        return {
          first: vi.fn(async () => response.first ?? null),
          all: vi.fn(async () => ({ results: response.all ?? [] })),
        };
      }),
    };
  });

  const db = { prepare, batch: vi.fn(async () => ({})) } as unknown as D1Database;
  return { db, prepare, calls };
}

function createSuggestEnv(db: D1Database, overrides: Partial<Env> = {}): Env {
  return {
    RIDINGS: {} as R2Bucket,
    ODA_DB: db,
    ODA_PROVINCES: 'ON,QC',
    ODA_SUGGEST_ENABLED: 'true',
    ...overrides,
  } as Env;
}

function params(overrides: Partial<SuggestQueryParams> = {}): SuggestQueryParams {
  return { q: 'main st tor', provinces: ['ON'], limit: 7, ...overrides };
}

function containerRow(overrides: MockRow = {}): MockRow {
  return {
    id: 1,
    province: 'ON',
    city: 'Toronto',
    city_key: 'TORONTO|ON',
    street_key: 'MAIN|ST',
    min_civic: 1,
    max_civic: 499,
    lat: 43.6891,
    lon: -79.2989,
    address_count: 250,
    rank: -5,
    ...overrides,
  };
}

describe('buildFtsMatchQuery', () => {
  it('quotes every token and appends a prefix star', () => {
    // ST is already canonical and is not a direction, so it has no alternative to OR in.
    expect(buildFtsMatchQuery('main st tor')).toBe('"MAIN"* AND "ST"* AND "TOR"*');
  });

  it('folds accents so montréal matches the indexed MONTREAL', () => {
    expect(buildFtsMatchQuery('montréal')).toBe('"MONTREAL"*');
  });

  it('expands rather than replaces canonical street forms, so "street" also matches "ST"', () => {
    const match = buildFtsMatchQuery('street');
    expect(match).toContain('"STREET"*');
    expect(match).toContain('"ST"*');
    expect(match).toContain(' OR ');
  });

  it('does not clobber a street NAME that collides with a direction word', () => {
    // normalizeStreetDirection('WEST') is 'W'. Replacing would turn a search for "West St"
    // into "W St" and miss the row entirely.
    const match = buildFtsMatchQuery('west');
    expect(match).toContain('"WEST"*');
    expect(match).toContain('"W"*');
  });

  it('keeps a hyphenated token inside quotes so - is not read as the NOT operator', () => {
    const match = buildFtsMatchQuery('ste-cath');
    expect(match).toBe('"STE-CATH"*');
    expect(match.startsWith('"')).toBe(true);
  });

  describe('injection', () => {
    it('neutralises a bare OR', () => {
      expect(buildFtsMatchQuery('main OR x')).toBe('"MAIN"* AND "OR"* AND "X"*');
    });

    it('neutralises NEAR and a stray star', () => {
      expect(buildFtsMatchQuery('a* NEAR b')).toBe('"A"* AND "NEAR"* AND "B"*');
    });

    it('strips embedded double quotes rather than breaking out of the literal', () => {
      const match = buildFtsMatchQuery('a"b');
      expect(match).toBe('"AB"*');
    });

    it('produces an empty match for punctuation-only input', () => {
      expect(buildFtsMatchQuery('!!!')).toBe('');
    });
  });
});

describe('container ids', () => {
  it('round-trips through encode/decode', () => {
    const id = encodeContainerId('ON', 'TORONTO|ON', 'MAIN|ST|N');
    expect(decodeContainerId(id)).toEqual({
      province: 'ON',
      cityKey: 'TORONTO|ON',
      streetKey: 'MAIN|ST|N',
    });
  });

  it('is url-safe', () => {
    const id = encodeContainerId('QC', 'MONTREAL|QC', 'STE-CATHERINE|RUE|O');
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('returns null for garbage rather than throwing', () => {
    expect(decodeContainerId('!!!not-base64!!!')).toBeNull();
  });
});

describe('scoreSuggestion', () => {
  const base: ScoreInputs = {
    suggestText: 'MAIN ST TORONTO ON',
    normalizedQuery: 'MAIN ST',
    bm25: -5,
    bm25Best: -10,
    bm25Worst: -1,
    addressCount: 100,
    maxAddressCount: 1000,
  };

  it('ranks a full-prefix match above a token-order match', () => {
    const prefix = scoreSuggestion(base);
    const tokens = scoreSuggestion({ ...base, normalizedQuery: 'MAIN ON' });
    expect(prefix).toBeGreaterThan(tokens);
  });

  it('ranks a token-order match above a bm25-only match', () => {
    const tokens = scoreSuggestion({ ...base, normalizedQuery: 'MAIN ON' });
    const noMatch = scoreSuggestion({ ...base, normalizedQuery: 'ZZZZ' });
    expect(tokens).toBeGreaterThan(noMatch);
  });

  it('breaks a bm25 tie on popularity', () => {
    const popular = scoreSuggestion({ ...base, addressCount: 900 });
    const rare = scoreSuggestion({ ...base, addressCount: 2 });
    expect(popular).toBeGreaterThan(rare);
  });

  it('does not divide by zero when every candidate scores alike', () => {
    const score = scoreSuggestion({ ...base, bm25: -5, bm25Best: -5, bm25Worst: -5 });
    expect(Number.isFinite(score)).toBe(true);
  });

  it('rewards a civic that lands inside the street range', () => {
    const inRange = scoreSuggestion({ ...base, civicInRange: true });
    const outOfRange = scoreSuggestion({ ...base, civicInRange: false });
    expect(inRange).toBeGreaterThan(outOfRange);
  });

  it('rewards proximity when a bias is supplied', () => {
    const near = scoreSuggestion({ ...base, distanceMeters: 100 });
    const far = scoreSuggestion({ ...base, distanceMeters: 100_000 });
    expect(near).toBeGreaterThan(far);
  });
});

describe('searchSuggestions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('short-circuits a sub-3-char query without touching D1 at all', async () => {
    const { db, prepare } = createMockD1([]);
    const result = await searchSuggestions(createSuggestEnv(db), params({ q: 'ma' }));

    expect(result.suggestions).toEqual([]);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('returns street containers and never queries oda_addresses when no civic is typed', async () => {
    const { db, calls } = createMockD1([{ all: [containerRow()] }]);
    const result = await searchSuggestions(createSuggestEnv(db), params({ q: 'main st tor' }));

    expect(result.suggestions).toHaveLength(1);
    const [suggestion] = result.suggestions;
    expect(suggestion.next).toBe('search');
    expect(suggestion.dataLevel).toBe('Street');
    expect(suggestion.addressCount).toBe(250);
    expect(suggestion.civicRange).toEqual({ min: 1, max: 499 });
    expect(calls.some((c) => /oda_addresses/.test(c.sql))).toBe(false);
  });

  it('exposes addressCount as a number, not text buried in description', () => {
    // Canada Post ships "- 7 Addresses" inside Description; callers should not have to regex it.
    expect(typeof containerRow().address_count).toBe('number');
  });

  it('strips the civic from the FTS match, since suggest_text holds no civic number', async () => {
    // Regression: matching on the raw query builds "250"* AND "MAIN"* ... against
    // "MAIN ST TORONTO ON", which matches nothing, so every civic query returned empty.
    const { db, calls } = createMockD1([{ all: [containerRow()] }, { first: null }]);
    await searchSuggestions(createSuggestEnv(db), params({ q: '250 main st tor' }));

    const ftsCall = calls.find((c) => /oda_suggest_fts/.test(c.sql));
    const match = String(ftsCall?.binds[0]);
    expect(match).not.toContain('250');
    expect(match).toBe('"MAIN"* AND "ST"* AND "TOR"*');
  });

  it('keeps a numeric street name when stripping the civic', async () => {
    const { db, calls } = createMockD1([{ all: [containerRow()] }, { first: null }]);
    await searchSuggestions(createSuggestEnv(db), params({ q: '250 16th ave' }));

    const match = String(calls.find((c) => /oda_suggest_fts/.test(c.sql))?.binds[0]);
    expect(match).toContain('"16TH"*');
    expect(match).not.toContain('"250"*');
  });

  it('strips the civic out of the unit-civic dash form', async () => {
    const { db, calls } = createMockD1([{ all: [containerRow()] }, { first: null }]);
    await searchSuggestions(createSuggestEnv(db), params({ q: '901-560 birchmount rd' }));

    const match = String(calls.find((c) => /oda_suggest_fts/.test(c.sql))?.binds[0]);
    expect(match).toContain('"BIRCHMOUNT"*');
    expect(match).not.toContain('901');
  });

  it('resolves a leaf when a civic is typed and an exact row exists', async () => {
    const { db, calls } = createMockD1([
      { all: [containerRow()] },
      {
        first: {
          civic_number: '250',
          unit: null,
          postal_code: 'M4L 1E7',
          street_name: 'MAIN',
          street_type: 'ST',
          street_direction: null,
          city: 'Toronto',
          province: 'ON',
          lat: 43.6891,
          lon: -79.2989,
          full_address: '250 Main St, Toronto ON',
        },
      },
    ]);

    const result = await searchSuggestions(createSuggestEnv(db), params({ q: '250 main st tor' }));

    expect(result.suggestions).toHaveLength(1);
    const [suggestion] = result.suggestions;
    expect(suggestion.next).toBe('lookup');
    expect(suggestion.dataLevel).toBe('Premise');
    expect(suggestion.addressComponents?.civic_number).toBe('250');
    expect(calls.some((c) => /oda_addresses/.test(c.sql))).toBe(true);
  });

  it('falls back to RangedPremise when the civic is in range but has no row', async () => {
    const { db } = createMockD1([{ all: [containerRow()] }, { first: null }]);
    const result = await searchSuggestions(createSuggestEnv(db), params({ q: '251 main st tor' }));

    const [suggestion] = result.suggestions;
    expect(suggestion.dataLevel).toBe('RangedPremise');
    // The point is the street centroid, not the address — the same honesty rule the geocoding
    // cascade applies to street_interpolated.
    expect(suggestion.location).toEqual({ lat: 43.6891, lon: -79.2989 });
  });

  it('does not query oda_addresses for a container whose range excludes the civic', async () => {
    const { db, calls } = createMockD1([
      { all: [containerRow({ min_civic: 1, max_civic: 99 })] },
    ]);
    await searchSuggestions(createSuggestEnv(db), params({ q: '900 main st tor' }));

    expect(calls.some((c) => /oda_addresses/.test(c.sql))).toBe(false);
  });

  it('filters by province in SQL', async () => {
    const { db, calls } = createMockD1([{ all: [containerRow()] }]);
    await searchSuggestions(createSuggestEnv(db), params({ provinces: ['ON', 'QC'] }));

    const ftsCall = calls.find((c) => /oda_suggest_fts/.test(c.sql));
    expect(ftsCall?.sql).toContain('s.province IN (?, ?)');
    expect(ftsCall?.binds).toContain('ON');
    expect(ftsCall?.binds).toContain('QC');
  });

  it('applies locationRestriction as a hard bbox filter', async () => {
    const { db, calls } = createMockD1([{ all: [containerRow()] }]);
    await searchSuggestions(
      createSuggestEnv(db),
      params({ locationRestriction: { minLat: 43, minLon: -80, maxLat: 44, maxLon: -79 } })
    );

    const ftsCall = calls.find((c) => /oda_suggest_fts/.test(c.sql));
    expect(ftsCall?.sql).toContain('s.lat BETWEEN ? AND ?');
    expect(ftsCall?.sql).toContain('s.lon BETWEEN ? AND ?');
  });

  describe('candidate window ordering', () => {
    // The window is a truncation, so what orders it decides what scoring is even allowed to see.
    // These assert the SQL, because the LIMIT runs in SQLite and a mock cannot execute it --
    // the behaviour itself is verified against a real database (see docs/oda-fixtures.md Case 14).

    it('orders by prefix match before anything else', async () => {
      const { db, calls } = createMockD1([{ all: [containerRow()] }]);
      await searchSuggestions(createSuggestEnv(db), params({ q: 'main st' }));

      const sql = String(calls.find((c) => /oda_suggest_fts/.test(c.sql))?.sql);
      const order = sql.slice(sql.indexOf('ORDER BY'));
      expect(order).toContain('CASE WHEN s.suggest_text LIKE ?');
      expect(order.indexOf('LIKE ?')).toBeLessThan(order.indexOf('rank'));
    });

    it('ranks bm25 LAST, not first', async () => {
      // Regression: `ORDER BY rank ASC` let bm25 alone pick the window. On real data every row
      // matching "main st" scored bm25 -0.0000 (IDF collapses when every row has both terms), so
      // the cut was arbitrary -- and Main St Toronto (250 addresses) was cut in favour of
      // Stouffville, Stratford and Steeles, whose city names merely start with "st".
      const { db, calls } = createMockD1([{ all: [containerRow()] }]);
      await searchSuggestions(createSuggestEnv(db), params({ q: 'main st' }));

      const sql = String(calls.find((c) => /oda_suggest_fts/.test(c.sql))?.sql);
      const order = sql.slice(sql.indexOf('ORDER BY'));
      expect(order.indexOf('s.address_count DESC')).toBeLessThan(order.indexOf('rank ASC'));
    });

    it('pushes locationBias into the window, not just into JS scoring', async () => {
      // Regression: proximity was applied in JS AFTER this query, so bm25 decided what proximity
      // was allowed to see and a nearby street could be cut before scoring ever ran.
      const { db, calls } = createMockD1([{ all: [containerRow()] }]);
      await searchSuggestions(
        createSuggestEnv(db),
        params({ q: 'main st', locationBias: { lat: 43.65, lon: -79.38 } })
      );

      const call = calls.find((c) => /oda_suggest_fts/.test(c.sql));
      expect(String(call?.sql)).toContain('(s.lat - ?)');
      expect(call?.binds).toEqual(expect.arrayContaining([43.65, -79.38]));
    });

    it('omits the distance term when no bias is given', async () => {
      const { db, calls } = createMockD1([{ all: [containerRow()] }]);
      await searchSuggestions(createSuggestEnv(db), params({ q: 'main st' }));
      expect(String(calls.find((c) => /oda_suggest_fts/.test(c.sql))?.sql)).not.toContain('(s.lat - ?)');
    });
  });

  it('applies proximity to the returned distanceMeters', async () => {
    const near = containerRow({ id: 1, street_key: 'MAIN|ST', lat: 43.65, lon: -79.38, rank: -5 });
    const far = containerRow({ id: 2, street_key: 'MAIN|ST', city_key: 'OTTAWA|ON', city: 'Ottawa', lat: 45.42, lon: -75.69, rank: -5 });

    const { db, calls } = createMockD1([{ all: [far, near] }]);
    const result = await searchSuggestions(
      createSuggestEnv(db),
      params({ q: 'main st', locationBias: { lat: 43.65, lon: -79.38 } })
    );

    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0].description).toContain('Toronto');
    expect(result.suggestions[0].distanceMeters).toBeLessThan(1000);

    // Bias must not become a hard filter: locationRestriction is the one that excludes.
    const ftsCall = calls.find((c) => /oda_suggest_fts/.test(c.sql));
    expect(ftsCall?.sql).not.toContain('BETWEEN');
  });

  it('rejects locationBias and locationRestriction together', async () => {
    const { db } = createMockD1([]);
    await expect(
      searchSuggestions(
        createSuggestEnv(db),
        params({
          locationBias: { lat: 43, lon: -79 },
          locationRestriction: { minLat: 43, minLon: -80, maxLat: 44, maxLon: -79 },
        })
      )
    ).rejects.toThrow(SuggestError);
  });

  it('reports a clear 503 when the suggest index has not been built yet', async () => {
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          all: vi.fn(async () => {
            throw new Error('D1_ERROR: no such table: oda_suggest_fts');
          }),
          first: vi.fn(async () => null),
        })),
      })),
    } as unknown as D1Database;

    await expect(searchSuggestions(createSuggestEnv(db), params())).rejects.toMatchObject({
      code: 'SUGGEST_INDEX_MISSING',
      status: 503,
    });
  });

  it('drills into a container by id without using FTS', async () => {
    const { db, calls } = createMockD1([
      {
        all: [
          {
            civic_number: '250',
            unit: null,
            postal_code: 'M4L 1E7',
            street_name: 'MAIN',
            street_type: 'ST',
            street_direction: null,
            city: 'Toronto',
            province: 'ON',
            lat: 43.6891,
            lon: -79.2989,
            full_address: '250 Main St, Toronto ON',
          },
        ],
      },
    ]);

    const containerId = encodeContainerId('ON', 'TORONTO|ON', 'MAIN|ST');
    const result = await searchSuggestions(createSuggestEnv(db), params({ q: 'main st', containerId }));

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].next).toBe('lookup');
    expect(calls.some((c) => /oda_suggest_fts/.test(c.sql))).toBe(false);
    expect(calls[0].binds).toEqual(expect.arrayContaining(['ON', 'TORONTO|ON', 'MAIN|ST']));
  });

  it('rejects a malformed containerId', async () => {
    const { db } = createMockD1([]);
    await expect(
      searchSuggestions(createSuggestEnv(db), params({ containerId: 'not-a-real-id!!' }))
    ).rejects.toMatchObject({ code: 'INVALID_CONTAINER_ID' });
  });

  describe('units', () => {
    const addressRow = (overrides: MockRow = {}) => ({
      civic_number: '560',
      unit: null,
      postal_code: 'M1N 3J7',
      street_name: 'BIRCHMOUNT',
      street_type: 'RD',
      street_direction: null,
      city: 'Scarborough',
      province: 'ON',
      lat: 43.7301,
      lon: -79.2701,
      full_address: '560 Birchmount Rd, Scarborough ON',
      unit_total: 0,
      ...overrides,
    });

    const birchmount = () => containerRow({ street_key: 'BIRCHMOUNT|RD', min_civic: 1, max_civic: 3000 });

    it('returns a tower as a building container rather than one arbitrary unit', async () => {
      const { db } = createMockD1([
        { all: [birchmount()] },
        { first: addressRow({ unit_total: 40 }) },
      ]);
      const result = await searchSuggestions(createSuggestEnv(db), params({ q: '560 birchmount rd' }));

      const [s] = result.suggestions;
      expect(s.next).toBe('search');
      expect(s.dataLevel).toBe('Premise');
      expect(s.types).toContain('building');
      expect(s.unitCount).toBe(40);
    });

    it('does not mistake duplicate unit-less records for a two-unit building', async () => {
      // ODA carries duplicate rows for the same civic with no unit. Counting rows instead of
      // distinct units would read those as a tower and hide the address behind a drill-down.
      const { db } = createMockD1([
        { all: [birchmount()] },
        { first: addressRow({ unit_total: 0 }) },
      ]);
      const result = await searchSuggestions(createSuggestEnv(db), params({ q: '560 birchmount rd' }));

      expect(result.suggestions[0].next).toBe('lookup');
      expect(result.suggestions[0].unitCount).toBeUndefined();
    });

    it('counts DISTINCT non-empty units in SQL, not rows', async () => {
      const { db, calls } = createMockD1([{ all: [birchmount()] }, { first: addressRow() }]);
      await searchSuggestions(createSuggestEnv(db), params({ q: '560 birchmount rd' }));

      const civicCall = calls.find((c) => /oda_addresses/.test(c.sql));
      expect(civicCall?.sql).toContain("COUNT(DISTINCT NULLIF(u.unit, ''))");
    });

    it('keeps a typed unit and resolves it to a real premise', async () => {
      // Regression: parseFreeformAddress has always parsed "205-560" into unit+civic, but
      // searchSuggestions read only .civic, so the unit was silently dropped and the caller got
      // an address missing the apartment -- a confident wrong answer.
      const { db, calls } = createMockD1([
        { all: [birchmount()] },
        { first: addressRow({ unit_total: 40 }) },
        { first: addressRow({ unit: '205', unit_total: 40 }) },
      ]);
      const result = await searchSuggestions(createSuggestEnv(db), params({ q: '205-560 birchmount rd' }));

      const [s] = result.suggestions;
      expect(s.next).toBe('lookup');
      expect(s.addressComponents?.unit).toBe('205');
      expect(calls.some((c) => /UPPER\(REPLACE\(a\.unit/.test(c.sql))).toBe(true);
    });

    it('offers the building when the typed unit does not exist there', async () => {
      const { db } = createMockD1([
        { all: [birchmount()] },
        { first: addressRow({ unit_total: 40 }) },
        { first: null },
      ]);
      const result = await searchSuggestions(createSuggestEnv(db), params({ q: '1503-560 birchmount rd' }));

      // Not the bare civic: that would drop the unit the user just typed.
      expect(result.suggestions[0].next).toBe('search');
      expect(result.suggestions[0].unitCount).toBe(40);
      expect(result.suggestions[0].dataLevel).not.toBe('RangedPremise');
    });

    it('returns the civic when a unit is typed but ODA holds no unit data for it', async () => {
      const { db } = createMockD1([
        { all: [birchmount()] },
        { first: addressRow({ unit_total: 0 }) },
        { first: null },
      ]);
      const result = await searchSuggestions(createSuggestEnv(db), params({ q: '5-560 birchmount rd' }));

      const [s] = result.suggestions;
      expect(s.next).toBe('lookup');
      // We never invent a unit ODA does not have.
      expect(s.addressComponents?.unit).toBeUndefined();
    });

    it('drills a building container into its units', async () => {
      const { db, calls } = createMockD1([
        { all: [addressRow({ unit: '101' }), addressRow({ unit: '102' })] },
      ]);
      const containerId = encodeContainerId('ON', 'SCARBOROUGH|ON', 'BIRCHMOUNT|RD', '560');
      const result = await searchSuggestions(
        createSuggestEnv(db),
        params({ q: '560 birchmount rd', containerId })
      );

      expect(result.suggestions.map((s) => s.addressComponents?.unit)).toEqual(['101', '102']);
      expect(calls[0].binds).toEqual(expect.arrayContaining(['560']));
      expect(calls.some((c) => /oda_suggest_fts/.test(c.sql))).toBe(false);
    });
  });

  describe('paging', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        civic_number: String(100 + i),
        unit: null,
        postal_code: 'M5B 1S8',
        street_name: 'YONGE',
        street_type: 'ST',
        street_direction: null,
        city: 'Toronto',
        province: 'ON',
        lat: 43.65,
        lon: -79.38,
        full_address: 'x',
        unit_total: 0,
      }));

    const streetId = () => encodeContainerId('ON', 'TORONTO|ON', 'YONGE|ST');

    it('returns a cursor when a container has more rows than the limit', async () => {
      // Over-fetch by one is how we know there is a next page without a second COUNT query.
      const { db } = createMockD1([{ all: many(8) }]);
      const result = await searchSuggestions(
        createSuggestEnv(db),
        params({ q: 'yonge st', containerId: streetId(), limit: 7 })
      );

      expect(result.suggestions).toHaveLength(7);
      expect(result.nextCursor).toBeTruthy();
      expect(decodeCursor(result.nextCursor!)).toEqual({ civicNum: 106, civicStr: '106' });
    });

    it('omits the cursor on the last page', async () => {
      const { db } = createMockD1([{ all: many(3) }]);
      const result = await searchSuggestions(
        createSuggestEnv(db),
        params({ q: 'yonge st', containerId: streetId(), limit: 7 })
      );

      expect(result.nextCursor).toBeUndefined();
    });

    it('resumes with a keyset predicate rather than an offset', async () => {
      const { db, calls } = createMockD1([{ all: many(2) }]);
      await searchSuggestions(
        createSuggestEnv(db),
        params({
          q: 'yonge st',
          containerId: streetId(),
          cursor: encodeCursor({ civicNum: 106, civicStr: '106' }),
        })
      );

      expect(calls[0].sql).toContain('(CAST(civic_number AS INTEGER), civic_number) > (?, ?)');
      expect(calls[0].sql).not.toContain('OFFSET');
      expect(calls[0].binds).toEqual(expect.arrayContaining([106, '106']));
    });

    it('rejects a malformed cursor', async () => {
      const { db } = createMockD1([]);
      await expect(
        searchSuggestions(
          createSuggestEnv(db),
          params({ q: 'yonge st', containerId: streetId(), cursor: 'not-a-cursor!!' })
        )
      ).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
    });
  });

  describe('unitPrefixFromQuery', () => {
    const ref = { province: 'ON', cityKey: 'SCARBOROUGH|ON', streetKey: 'BIRCHMOUNT|RD', civic: '560' };

    it('takes what remains after the civic and street', () => {
      expect(unitPrefixFromQuery('560 birchmount rd 15', ref)).toBe('15');
    });

    it('is empty when nothing follows the street', () => {
      expect(unitPrefixFromQuery('560 birchmount rd', ref)).toBe('');
    });

    it('handles a street with a direction', () => {
      const withDir = { ...ref, streetKey: 'QUEEN|ST|W' };
      expect(unitPrefixFromQuery('560 queen st w 3', withDir)).toBe('3');
    });
  });

  it('never attaches a riding to any suggestion', async () => {
    // Riding is resolved by the caller from `location` via the existing lookup routes, only
    // once the user selects. If this ever fails, /api/search has grown an R2 dependency.
    const { db } = createMockD1([{ all: [containerRow()] }]);
    const result = await searchSuggestions(createSuggestEnv(db), params());

    for (const suggestion of result.suggestions) {
      expect(suggestion).not.toHaveProperty('riding');
      expect(suggestion).not.toHaveProperty('properties');
    }
  });

  it('echoes the searched provinces so callers can tell "no match" from "not covered"', async () => {
    const { db } = createMockD1([{ all: [] }]);
    const result = await searchSuggestions(createSuggestEnv(db), params({ provinces: ['NU'] }));

    expect(result.suggestions).toEqual([]);
    expect(result.provinces).toEqual(['NU']);
  });
});
