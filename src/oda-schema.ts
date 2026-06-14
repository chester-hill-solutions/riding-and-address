import { Env } from './types';
import { ODA_DEFAULTS } from './oda-config';

export interface OdaStats {
  enabled: boolean;
  provinces: Record<string, { addressCount: number; lastImport?: string }>;
  postalCentroids: number;
  cityCentroids: number;
  streetRanges: number;
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
    return { enabled: false, provinces: {}, postalCentroids: 0, cityCentroids: 0, streetRanges: 0, imports: [] };
  }

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
    return { enabled: true, provinces: {}, postalCentroids: 0, cityCentroids: 0, streetRanges: 0, imports: [] };
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
}

export { ODA_DEFAULTS };
