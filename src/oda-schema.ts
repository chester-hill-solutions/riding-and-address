import { Env } from './types';
import { ODA_DEFAULTS } from './oda-config';

export interface OdaStats {
  enabled: boolean;
  provinces: Record<string, { addressCount: number; lastImport?: string }>;
  postalCentroids: number;
  cityCentroids: number;
  streetRanges: number;
  /** 0 when the suggest tables have not been built yet. */
  streetSuggest: number;
  imports: Array<{
    province: string;
    sourceVersion: string;
    rowCount: number;
    startedAt: string;
    finishedAt: string;
  }>;
}

/** Tables and indexes — safe for `wrangler d1 execute --file` */
export function getOdaBaseSchemaSql(): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS oda_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province TEXT NOT NULL,
      source_url TEXT,
      source_version TEXT NOT NULL,
      row_count INTEGER DEFAULT 0,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      checksum TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS oda_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province TEXT NOT NULL,
      civic_number TEXT,
      street_name TEXT,
      street_type TEXT,
      street_direction TEXT,
      unit TEXT,
      postal_code TEXT,
      city TEXT,
      city_key TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      full_address TEXT,
      mailing_line1 TEXT,
      mailing_line2 TEXT,
      municipality TEXT,
      province_code TEXT,
      mailing_postal_code TEXT,
      search_key TEXT NOT NULL,
      street_key TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS oda_postal_centroids (
      province TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      address_count INTEGER NOT NULL,
      PRIMARY KEY (province, postal_code)
    )`,
    `CREATE TABLE IF NOT EXISTS oda_city_centroids (
      province TEXT NOT NULL,
      city_key TEXT NOT NULL,
      city TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      address_count INTEGER NOT NULL,
      PRIMARY KEY (province, city_key)
    )`,
    `CREATE TABLE IF NOT EXISTS oda_street_ranges (
      province TEXT NOT NULL,
      city_key TEXT NOT NULL,
      street_key TEXT NOT NULL,
      min_civic INTEGER,
      max_civic INTEGER,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      address_count INTEGER NOT NULL,
      PRIMARY KEY (province, city_key, street_key)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_oda_postal ON oda_addresses(province, postal_code)`,
    `CREATE INDEX IF NOT EXISTS idx_oda_street ON oda_addresses(province, city_key, street_key, civic_number)`,
    `CREATE INDEX IF NOT EXISTS idx_oda_search ON oda_addresses(search_key)`,
    `CREATE INDEX IF NOT EXISTS idx_oda_city ON oda_addresses(province, city_key)`,
    `CREATE INDEX IF NOT EXISTS idx_oda_coords ON oda_addresses(province, lat, lon)`,
  ];
}

/** Full schema for POST /api/oda/init */
export function getOdaSchemaSql(): string[] {
  return getOdaBaseSchemaSql();
}

/**
 * Autocomplete schema. Deliberately NOT part of getOdaBaseSchemaSql() — the ODA import takes
 * hours and POST /api/oda/init must stay byte-for-byte unchanged. Built separately by
 * scripts/build-oda-suggest.ts from tables that already exist.
 *
 * Standalone FTS5 rather than external-content: external-content needs triggers or a 'rebuild'
 * statement to stay in sync, and D1's trigger support is undocumented.
 */
export function getOdaSuggestSchemaSql(): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS oda_street_suggest (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      province TEXT NOT NULL,
      city_key TEXT NOT NULL,
      street_key TEXT NOT NULL,
      city TEXT NOT NULL,
      suggest_text TEXT NOT NULL,
      min_civic INTEGER,
      max_civic INTEGER,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      address_count INTEGER NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_oda_suggest_pk ON oda_street_suggest(province, city_key, street_key)`,
    // Powers the range-predicate fallback if FTS5 is unavailable on remote D1.
    `CREATE INDEX IF NOT EXISTS idx_oda_suggest_prefix ON oda_street_suggest(suggest_text)`,
    `CREATE INDEX IF NOT EXISTS idx_oda_suggest_rank ON oda_street_suggest(province, address_count DESC)`,
    // remove_diacritics 2 mirrors what foldAccents already does on the query side.
    `CREATE VIRTUAL TABLE IF NOT EXISTS oda_suggest_fts USING fts5(
      suggest_text,
      prefix = '2 3 4',
      tokenize = 'unicode61 remove_diacritics 2'
    )`,
  ];
}

/** Tables created by getOdaSuggestSchemaSql, in safe deletion order. */
export const ODA_SUGGEST_TABLES = ['oda_suggest_fts', 'oda_street_suggest'] as const;

/**
 * Rebuild the suggest rows for one province from tables the import already populated.
 * Runs entirely inside D1 — no CSV, no re-import, no rows crossing the wire.
 * Idempotent: safe to re-run per province.
 *
 * The city token comes from city_key rather than the display `city` column because city_key is
 * already accent-folded and uppercased by buildCityKey, keeping the indexed text in the same
 * normal form normalizeSearchToken produces at query time.
 */
export function buildSuggestPopulateSql(province: string): Array<{ sql: string; params: string[] }> {
  return [
    { sql: `DELETE FROM oda_suggest_fts WHERE rowid IN (SELECT id FROM oda_street_suggest WHERE province = ?)`, params: [province] },
    { sql: `DELETE FROM oda_street_suggest WHERE province = ?`, params: [province] },
    {
      sql: `INSERT INTO oda_street_suggest
              (province, city_key, street_key, city, suggest_text, min_civic, max_civic, lat, lon, address_count)
            SELECT r.province, r.city_key, r.street_key, c.city,
                   REPLACE(r.street_key, '|', ' ') || ' '
                     || SUBSTR(c.city_key, 1, INSTR(c.city_key, '|') - 1) || ' ' || r.province,
                   r.min_civic, r.max_civic, r.lat, r.lon, r.address_count
            FROM oda_street_ranges r
            JOIN oda_city_centroids c ON c.province = r.province AND c.city_key = r.city_key
            WHERE r.province = ?`,
      params: [province],
    },
    {
      sql: `INSERT INTO oda_suggest_fts(rowid, suggest_text)
            SELECT id, suggest_text FROM oda_street_suggest WHERE province = ?`,
      params: [province],
    },
  ];
}

/** Probe sqlite_master so callers can degrade gracefully when the suggest tables aren't built. */
export async function tableExists(db: D1Database, table: string): Promise<boolean> {
  try {
    const row = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ? LIMIT 1`)
      .bind(table)
      .first();
    return Boolean(row);
  } catch {
    return false;
  }
}

export async function initializeOdaDatabase(env: Env): Promise<boolean> {
  if (!env.ODA_DB) {
    console.error('ODA_DB binding not configured');
    return false;
  }

  try {
    for (const sql of getOdaSchemaSql()) {
      await env.ODA_DB.prepare(sql).run();
    }

    console.log('ODA database initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize ODA database:', error);
    return false;
  }
}

export async function getOdaStats(env: Env): Promise<OdaStats> {
  if (!env.ODA_DB) {
    return { enabled: false, provinces: {}, postalCentroids: 0, cityCentroids: 0, streetRanges: 0, streetSuggest: 0, imports: [] };
  }

  // Counted separately, and never inside the try block below: the suggest tables may not be built
  // yet, and this block's catch returns an empty stats object — a throw here would report zero
  // addresses for every province.
  const streetSuggest = await countStreetSuggest(env.ODA_DB);

  try {
    const provinceCounts = await env.ODA_DB.prepare(`
      SELECT province, COUNT(*) as count FROM oda_addresses GROUP BY province
    `).all();

    const imports = await env.ODA_DB.prepare(`
      SELECT province, source_version, row_count, started_at, finished_at
      FROM oda_imports ORDER BY finished_at DESC LIMIT 20
    `).all();

    const postalResult = await env.ODA_DB.prepare(`SELECT COUNT(*) as count FROM oda_postal_centroids`).first();
    const cityResult = await env.ODA_DB.prepare(`SELECT COUNT(*) as count FROM oda_city_centroids`).first();
    const streetResult = await env.ODA_DB.prepare(`SELECT COUNT(*) as count FROM oda_street_ranges`).first();

    const provinces: Record<string, { addressCount: number; lastImport?: string }> = {};
    for (const row of provinceCounts.results || []) {
      const prov = row.province as string;
      provinces[prov] = { addressCount: (row.count as number) || 0 };
    }

    for (const row of imports.results || []) {
      const prov = row.province as string;
      if (provinces[prov]) {
        provinces[prov].lastImport = row.finished_at as string;
      }
    }

    return {
      enabled: true,
      provinces,
      postalCentroids: (postalResult?.count as number) || 0,
      cityCentroids: (cityResult?.count as number) || 0,
      streetRanges: (streetResult?.count as number) || 0,
      streetSuggest,
      imports: (imports.results || []).map((row) => ({
        province: row.province as string,
        sourceVersion: row.source_version as string,
        rowCount: row.row_count as number,
        startedAt: row.started_at as string,
        finishedAt: row.finished_at as string,
      })),
    };
  } catch (error) {
    console.error('Failed to get ODA stats:', error);
    return { enabled: true, provinces: {}, postalCentroids: 0, cityCentroids: 0, streetRanges: 0, streetSuggest, imports: [] };
  }
}

async function countStreetSuggest(db: D1Database): Promise<number> {
  if (!(await tableExists(db, 'oda_street_suggest'))) return 0;
  try {
    const row = await db.prepare(`SELECT COUNT(*) as count FROM oda_street_suggest`).first();
    return (row?.count as number) || 0;
  } catch (error) {
    console.error('Failed to count oda_street_suggest:', error);
    return 0;
  }
}

export async function deleteProvinceData(env: Env, province: string): Promise<void> {
  if (!env.ODA_DB) return;

  await env.ODA_DB.batch([
    env.ODA_DB.prepare(`DELETE FROM oda_addresses WHERE province = ?`).bind(province),
    env.ODA_DB.prepare(`DELETE FROM oda_postal_centroids WHERE province = ?`).bind(province),
    env.ODA_DB.prepare(`DELETE FROM oda_city_centroids WHERE province = ?`).bind(province),
    env.ODA_DB.prepare(`DELETE FROM oda_street_ranges WHERE province = ?`).bind(province),
  ]);

  await deleteProvinceSuggestData(env.ODA_DB, province);
}

/**
 * Separate from the batch above so a missing suggest table (the normal state before the
 * migration runs) cannot fail the delete of the four tables that do exist. Still required:
 * without it, deleting a province leaves stale suggestions behind.
 */
async function deleteProvinceSuggestData(db: D1Database, province: string): Promise<void> {
  if (!(await tableExists(db, 'oda_street_suggest'))) return;
  try {
    await db.batch([
      db.prepare(`DELETE FROM oda_suggest_fts WHERE rowid IN (SELECT id FROM oda_street_suggest WHERE province = ?)`).bind(province),
      db.prepare(`DELETE FROM oda_street_suggest WHERE province = ?`).bind(province),
    ]);
  } catch (error) {
    console.error(`Failed to delete suggest data for ${province}:`, error);
  }
}

export { ODA_DEFAULTS };
