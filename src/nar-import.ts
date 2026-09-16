import { escapeSql } from './oda-import';
import { NarCityScope } from './nar-normalize';
import { PROVINCE_ID_TO_CODE } from './oda-normalize';

/** StatCan National Address Register (NAR), catalogue 46-26-0002. */
export const NAR_DEFAULTS = {
  /** Latest released vintage. Semiannual; override with --version. */
  VERSION: '202606',
  PRODUCT_BASE_URL: 'https://www150.statcan.gc.ca/n1/pub/46-26-0002/2022001',
  IMPORT_BATCH_SIZE: 500,
  PROVIDER: 'statcan-nar' as const,
} as const;

export function narZipUrl(version: string): string {
  return `${NAR_DEFAULTS.PRODUCT_BASE_URL}/${version}.zip`;
}

/**
 * Collapse whitespace in SQL destined for `wrangler d1 execute --command`.
 *
 * The command reaches wrangler through the shell and `JSON.stringify` turns a template literal's
 * newlines into a literal `\n` inside the SQL, which SQLite then rejects. Multi-line statements
 * (e.g. the provenance read) must be flattened first.
 */
export function normalizeSqlForCli(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/** StatCan province code as it appears in NAR filenames (`Address_35_…` for Ontario). */
export function provinceNumericCode(province: string): string | undefined {
  return Object.entries(PROVINCE_ID_TO_CODE).find(([, code]) => code === province)?.[0];
}

/**
 * Pick the CSV entries for one province from one archive folder.
 *
 * Deliberately shape-based rather than an exact filename: the NAR layout changed once already,
 * and the province is identified by its numeric StatCan code (`Address_35_…`), not its postal
 * abbreviation. Every part is returned so split provinces stream complete.
 */
export function selectNarEntries(
  entries: string[],
  folder: 'Addresses' | 'Locations',
  province: string
): string[] {
  const numeric = provinceNumericCode(province);
  const inFolder = entries.filter(
    (entry) => /\.csv$/i.test(entry) && new RegExp(`(^|/)${folder}/`, 'i').test(entry)
  );
  if (inFolder.length === 0) {
    throw new Error(`No ${folder} CSV entries found in the NAR archive`);
  }

  const pool = inFolder.filter((entry) => {
    const file = entry.split('/').pop() ?? entry;
    const numericToken = numeric ? new RegExp(`(^|[^0-9])${numeric}([^0-9]|$)`) : null;
    const codeToken = new RegExp(`(^|[^A-Za-z])${province}([^A-Za-z]|$)`);
    return Boolean(numericToken?.test(file)) || codeToken.test(file);
  });

  if (pool.length === 0) {
    throw new Error(
      `No ${folder} CSV for province ${province} (numeric ${numeric ?? '?'}) in the NAR archive`
    );
  }
  return pool.sort();
}

/**
 * Per-city provenance. Deliberately a separate table from `oda_imports`:
 *
 * - `oda_imports` is province-scoped and `source_version` is a hardcoded ODA constant; adding a
 *   city there would require changing insert paths that the runtime stats endpoint reads.
 * - This table is also the rotation's ledger: a queue entry is "done" for a vintage exactly when
 *   a finished row exists. Nothing else needs to be scanned to decide what to import next.
 *
 * It is NOT part of the ODA base schema / `POST /api/oda/init` — that endpoint's output is
 * deliberately frozen, and the NAR tables are created only by the NAR import script.
 */
export function getNarSchemaSql(): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS nar_city_imports (
      province TEXT NOT NULL,
      city_key TEXT NOT NULL,
      city TEXT NOT NULL,
      nar_version TEXT NOT NULL,
      source_url TEXT,
      row_count INTEGER DEFAULT 0,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      PRIMARY KEY (province, city_key, nar_version)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_nar_city_imports_version
      ON nar_city_imports(nar_version, province, city_key)`,
    // Per-city_key vintage, for response provenance. `nar_city_imports` is the rotation ledger
    // keyed by the canonical city; this maps every alias key a refreshed city wrote rows under
    // (e.g. EAST YORK|ON as well as TORONTO|ON) back to the vintage, so a lookup can state the
    // vintage of the row it actually returned.
    `CREATE TABLE IF NOT EXISTS nar_city_keys (
      province TEXT NOT NULL,
      city_key TEXT NOT NULL,
      nar_version TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (province, city_key)
    )`,
  ];
}

export function buildNarCityKeysSql(province: string, scope: NarCityScope, version: string): string[] {
  return scope.cityKeys.map(
    (cityKey) =>
      `INSERT OR REPLACE INTO nar_city_keys (province, city_key, nar_version, updated_at)
       VALUES (${escapeSql(province)}, ${escapeSql(cityKey)}, ${escapeSql(version)}, datetime('now'));`
  );
}

/**
 * Rows removed per delete statement.
 *
 * A single `DELETE` covering Toronto's 527k rows exceeded D1's CPU budget ("D1 DB exceeded its
 * CPU time limit and was reset") — maintaining five indexes for half a million rows in one
 * statement is too much. Deletes are therefore issued repeatedly, each bounded to this many
 * rows, and repeated until the city's rows are gone. `ORDER BY id LIMIT` walks the rowid index,
 * so it does not sort the whole table per chunk.
 */
export const NAR_DELETE_CHUNK_ROWS = 5_000;

/**
 * One bounded chunk of the previous vintage's rows for the refreshed city.
 *
 * `lastExistingId` is the greatest id that existed before the run. New rows are inserted from the
 * next id upward, so the guard removes exactly the rows that predate the refresh and cannot erase
 * what this run wrote — which matters because the refreshed city_key is itself in the delete
 * scope.
 */
export function buildNarAddressDeleteChunkSql(
  province: string,
  scope: NarCityScope,
  lastExistingId: number,
  limit = NAR_DELETE_CHUNK_ROWS
): string {
  return `DELETE FROM oda_addresses
    WHERE id IN (
      SELECT id FROM oda_addresses
      WHERE province = ${escapeSql(province)}
        AND city_key IN (${scope.cityKeys.map(escapeSql).join(', ')})
        AND id <= ${lastExistingId}
      ORDER BY id
      LIMIT ${limit}
    );`;
}

export function buildNarCityCentroidDeleteSql(province: string, scope: NarCityScope): string {
  return `DELETE FROM oda_city_centroids
    WHERE province = ${escapeSql(province)}
      AND city_key IN (${scope.cityKeys.map(escapeSql).join(', ')});`;
}

/** Bounded equivalent of the street-range delete; a dense city can have tens of thousands. */
export function buildNarStreetRangeDeleteChunkSql(
  province: string,
  scope: NarCityScope,
  limit = NAR_DELETE_CHUNK_ROWS
): string {
  return `DELETE FROM oda_street_ranges
    WHERE rowid IN (
      SELECT rowid FROM oda_street_ranges
      WHERE province = ${escapeSql(province)}
        AND city_key IN (${scope.cityKeys.map(escapeSql).join(', ')})
      LIMIT ${limit}
    );`;
}

/**
 * Recompute postal centroids for the postal codes a city refresh touched, from the whole table.
 *
 * Postal centroids are keyed `(province, postal_code)` and are not city-scoped, so the city
 * delete must not touch them: a postal code can straddle a city line, and a postal code that
 * vanished from the city slice would otherwise keep a centroid with zero backing rows. Deleting
 * by touched postal code and re-aggregating from `oda_addresses` is correct in both directions.
 */
export function buildNarPostalRecomputeSql(province: string, postalCodes: string[]): string[] {
  if (postalCodes.length === 0) return [];
  const list = postalCodes.map(escapeSql).join(', ');
  return [
    `DELETE FROM oda_postal_centroids WHERE province = ${escapeSql(province)} AND postal_code IN (${list});`,
    `INSERT OR REPLACE INTO oda_postal_centroids (province, postal_code, lat, lon, address_count)
      SELECT province, postal_code, AVG(lat), AVG(lon), COUNT(*)
      FROM oda_addresses
      WHERE province = ${escapeSql(province)} AND postal_code IN (${list})
      GROUP BY province, postal_code;`,
  ];
}

export function buildNarProvenanceSql(input: {
  province: string;
  scope: NarCityScope;
  city: string;
  version: string;
  sourceUrl: string;
  rowCount: number;
}): string {
  const { province, scope, city, version, sourceUrl, rowCount } = input;
  return `INSERT INTO nar_city_imports
      (province, city_key, city, nar_version, source_url, row_count, finished_at)
    VALUES (
      ${escapeSql(province)}, ${escapeSql(`${scope.canonicalToken}|${province}`)}, ${escapeSql(city)},
      ${escapeSql(version)}, ${escapeSql(sourceUrl)}, ${rowCount}, datetime('now')
    )
    ON CONFLICT(province, city_key, nar_version) DO UPDATE SET
      city = excluded.city,
      source_url = excluded.source_url,
      row_count = excluded.row_count,
      finished_at = excluded.finished_at;`;
}

export interface NarCityQueueEntry {
  province: string;
  city: string;
}

/**
 * Queue file format: one `PROVINCE<TAB>City` per line, `#` comments and blanks ignored.
 * Kept human-editable on purpose — the daily order is an editorial decision, not data.
 */
export function parseNarCityQueue(text: string): NarCityQueueEntry[] {
  const entries: NarCityQueueEntry[] = [];
  const seen = new Set<string>();

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [province, ...rest] = trimmed.split('\t');
    const city = rest.join('\t').trim();
    if (!province || !city) continue;
    const key = `${province.trim().toUpperCase()}|${city}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ province: province.trim().toUpperCase(), city });
  }

  return entries;
}

export function pickNextNarCity(
  entries: NarCityQueueEntry[],
  completedKeys: ReadonlySet<string>
): NarCityQueueEntry | undefined {
  return entries.find((entry) => !completedKeys.has(`${entry.province}|${entry.city}`.toUpperCase()));
}
