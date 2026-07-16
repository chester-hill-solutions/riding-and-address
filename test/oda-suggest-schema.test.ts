import { describe, it, expect, vi } from 'vitest';
import {
  getOdaBaseSchemaSql,
  getOdaSchemaSql,
  getOdaSuggestSchemaSql,
  buildSuggestPopulateSql,
  getOdaStats,
  deleteProvinceData,
  tableExists,
} from '../src/oda-schema';
import { Env } from '../src/types';

/**
 * These are the tests that earn the "additive, breaks nothing" claim. The suggest tables do not
 * exist until a separate migration runs, so every existing code path has to keep working while
 * they are absent.
 */

interface StubOptions {
  /** Tables that "exist" in sqlite_master. */
  existing: string[];
  counts?: Record<string, number>;
  provinceRows?: Array<{ province: string; count: number }>;
}

function createStubD1(options: StubOptions) {
  const seen: string[] = [];
  const batches: string[][] = [];

  const prepare = vi.fn((sql: string) => {
    seen.push(sql);

    const missing = /FROM\s+(oda_\w+)/i.exec(sql)?.[1];
    const isMissingTable =
      missing && missing !== 'sqlite_master' && !options.existing.includes(missing);

    const runQuery = async () => {
      if (isMissingTable) throw new Error(`D1_ERROR: no such table: ${missing}`);
      return null;
    };

    return {
      bind: vi.fn((...binds: unknown[]) => ({
        first: vi.fn(async () => {
          if (/sqlite_master/.test(sql)) {
            return options.existing.includes(String(binds[0])) ? { name: binds[0] } : null;
          }
          return runQuery();
        }),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => ({})),
        __sql: sql,
      })),
      first: vi.fn(async () => {
        if (isMissingTable) throw new Error(`D1_ERROR: no such table: ${missing}`);
        const match = /FROM\s+(oda_\w+)/i.exec(sql)?.[1];
        return { count: options.counts?.[match ?? ''] ?? 0 };
      }),
      all: vi.fn(async () => {
        if (isMissingTable) throw new Error(`D1_ERROR: no such table: ${missing}`);
        if (/GROUP BY province/.test(sql)) {
          return { results: options.provinceRows ?? [] };
        }
        return { results: [] };
      }),
      run: vi.fn(async () => ({})),
    };
  });

  const batch = vi.fn(async (statements: Array<{ __sql?: string }>) => {
    batches.push(statements.map((s) => s.__sql ?? ''));
    return [];
  });

  const db = { prepare, batch } as unknown as D1Database;
  return { db, prepare, batch, seen, batches };
}

const ALL_ODA_TABLES = [
  'oda_addresses',
  'oda_postal_centroids',
  'oda_city_centroids',
  'oda_street_ranges',
  'oda_imports',
];

describe('suggest DDL is additive', () => {
  it('is not part of the base schema, so the ODA import and /api/oda/init cannot drift', () => {
    const base = getOdaBaseSchemaSql().join('\n');
    expect(base).not.toContain('oda_street_suggest');
    expect(base).not.toContain('oda_suggest_fts');
    expect(base).not.toContain('fts5');
  });

  it('keeps getOdaSchemaSql identical to the base schema', () => {
    expect(getOdaSchemaSql()).toEqual(getOdaBaseSchemaSql());
  });

  it('creates only new tables and never alters an existing one', () => {
    const ddl = getOdaSuggestSchemaSql().join('\n');
    expect(ddl).not.toMatch(/ALTER\s+TABLE/i);
    expect(ddl).not.toMatch(/DROP\s+TABLE/i);
    for (const table of ALL_ODA_TABLES) {
      expect(ddl).not.toContain(`CREATE TABLE IF NOT EXISTS ${table} `);
    }
  });

  it('uses FTS5 prefix indexes and not the undocumented trigram tokenizer', () => {
    const ddl = getOdaSuggestSchemaSql().join('\n');
    expect(ddl).toContain("prefix = '2 3 4'");
    expect(ddl).toContain('unicode61');
    expect(ddl).not.toContain('trigram');
  });
});

describe('buildSuggestPopulateSql', () => {
  it('derives from the centroid tables and never scans oda_addresses', () => {
    const sql = buildSuggestPopulateSql('ON').map((s) => s.sql).join('\n');
    expect(sql).toContain('FROM oda_street_ranges');
    expect(sql).toContain('JOIN oda_city_centroids');
    expect(sql).not.toContain('oda_addresses');
  });

  it('is idempotent: it clears the province before reinserting it', () => {
    const statements = buildSuggestPopulateSql('ON');
    expect(statements[0].sql).toMatch(/DELETE FROM oda_suggest_fts/);
    expect(statements[1].sql).toMatch(/DELETE FROM oda_street_suggest/);
    expect(statements.every((s) => s.params.includes('ON'))).toBe(true);
  });

  it('keeps the fts rowid tied to the suggest row id', () => {
    const sql = buildSuggestPopulateSql('ON').map((s) => s.sql).join('\n');
    expect(sql).toContain('INSERT INTO oda_suggest_fts(rowid, suggest_text)');
  });
});

describe('getOdaStats with the suggest tables absent', () => {
  it('still reports province counts, and reports streetSuggest as 0', async () => {
    // The regression this guards: getOdaStats wraps every query in ONE try/catch whose fallback
    // returns an empty stats object. A COUNT against the not-yet-created suggest table thrown
    // inside that block would report zero addresses for every province.
    const { db } = createStubD1({
      existing: ALL_ODA_TABLES,
      provinceRows: [{ province: 'ON', count: 6_000_000 }],
    });

    const stats = await getOdaStats({ ODA_DB: db } as unknown as Env);

    expect(stats.enabled).toBe(true);
    expect(stats.streetSuggest).toBe(0);
    expect(stats.provinces.ON.addressCount).toBe(6_000_000);
  });

  it('reports the count once the tables exist', async () => {
    const { db } = createStubD1({
      existing: [...ALL_ODA_TABLES, 'oda_street_suggest', 'oda_suggest_fts'],
      counts: { oda_street_suggest: 4321 },
      provinceRows: [{ province: 'ON', count: 6_000_000 }],
    });

    const stats = await getOdaStats({ ODA_DB: db } as unknown as Env);
    expect(stats.streetSuggest).toBe(4321);
  });

  it('returns streetSuggest 0 when ODA_DB is unbound', async () => {
    const stats = await getOdaStats({} as Env);
    expect(stats).toMatchObject({ enabled: false, streetSuggest: 0 });
  });
});

describe('suggest staleness reporting', () => {
  it('reports no stale provinces when the suggest tables are absent', async () => {
    // Same trap as the count: this query must not take the whole stats response down while the
    // index does not exist yet.
    const { db } = createStubD1({
      existing: ALL_ODA_TABLES,
      provinceRows: [{ province: 'ON', count: 6_000_000 }],
    });

    const stats = await getOdaStats({ ODA_DB: db } as unknown as Env);
    expect(stats.streetSuggestStaleProvinces).toEqual([]);
    expect(stats.provinces.ON.addressCount).toBe(6_000_000);
  });

  it('reports staleness as an empty array, never undefined', async () => {
    const stats = await getOdaStats({} as Env);
    expect(Array.isArray(stats.streetSuggestStaleProvinces)).toBe(true);
  });
});

describe('deleteProvinceData with the suggest tables absent', () => {
  it('still clears the four existing tables and does not throw', async () => {
    // A DELETE against a missing table inside the existing batch would take the whole admin
    // delete down with it.
    const { db, batch } = createStubD1({ existing: ALL_ODA_TABLES });

    await expect(
      deleteProvinceData({ ODA_DB: db } as unknown as Env, 'ON')
    ).resolves.toBeUndefined();

    expect(batch).toHaveBeenCalledTimes(1);
  });

  it('clears the suggest rows too once the tables exist', async () => {
    const { db, batch } = createStubD1({
      existing: [...ALL_ODA_TABLES, 'oda_street_suggest', 'oda_suggest_fts'],
    });

    await deleteProvinceData({ ODA_DB: db } as unknown as Env, 'ON');

    // Two batches: the original four tables, then the guarded suggest pair.
    expect(batch).toHaveBeenCalledTimes(2);
  });
});

describe('tableExists', () => {
  it('is true for a known table and false for an unknown one', async () => {
    const { db } = createStubD1({ existing: ['oda_addresses'] });
    expect(await tableExists(db, 'oda_addresses')).toBe(true);
    expect(await tableExists(db, 'oda_street_suggest')).toBe(false);
  });
});
