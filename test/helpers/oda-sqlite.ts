/**
 * Real-SQLite harness for the ODA read path.
 *
 * The D1 adapter in `src/address-store.ts` owns every query shape; this helper executes those
 * exact statements against an in-memory SQLite seeded through the fixture-normalisation pipeline.
 * That replaces the hand-written JS ranking that used to live in `oda-memory-db.ts` and had
 * already drifted from the SQL twice.
 *
 * Runtime: Node's built-in `node:sqlite` (FTS5 included, no new dependency). `.nvmrc` pins Node
 * 24 and CI sets it up, because `node:sqlite` is experimental on Node 22 behind a flag.
 */
import { DatabaseSync } from 'node:sqlite';
import { getOdaBaseSchemaSql, getOdaSuggestSchemaSql } from '../../src/oda-schema';
import { loadOdaFixtureDb, type OdaMemoryAddressRow, type OdaMemoryDb } from './oda-memory-db';

/** Values `node:sqlite` accepts as bound parameters. */
type SqlValue = string | number | bigint | null;

/** The slice of D1 the ODA read path touches. Cast to `D1Database` at the boundary. */
interface D1ShimStatement {
  bind(...params: SqlValue[]): D1ShimStatement;
  first(): Promise<unknown>;
  all(): Promise<{ results: unknown[]; success: boolean; meta: Record<string, unknown> }>;
  run(): Promise<{ success: boolean; meta: Record<string, unknown> }>;
}

export interface D1ShimOptions {
  /** Awaited once before every executed statement; lets a test pause a query mid-flight. */
  beforeRead?: () => void | Promise<void>;
}

export function createD1Shim(sqlite: DatabaseSync, options: D1ShimOptions = {}): D1Database {
  const beforeRead = options.beforeRead;

  function statement(sql: string, params: SqlValue[]): D1ShimStatement {
    const all = async () => {
      if (beforeRead) await beforeRead();
      const results = sqlite.prepare(sql).all(...params);
      return { results: results as unknown[], success: true, meta: {} };
    };

    const first = async () => {
      if (beforeRead) await beforeRead();
      return sqlite.prepare(sql).get(...params) ?? null;
    };

    const run = async () => {
      if (beforeRead) await beforeRead();
      sqlite.prepare(sql).run(...params);
      return { success: true, meta: {} };
    };

    return { bind: (...bound: SqlValue[]) => statement(sql, bound), all, first, run };
  }

  const shim = {
    prepare: (sql: string): D1ShimStatement => statement(sql, []),
    batch: async (): Promise<unknown[]> => [],
  };
  return shim as unknown as D1Database;
}

/** Empty schema only: base tables plus the autocomplete/FTS tables. */
export function createOdaSqlite(): { sqlite: DatabaseSync; close(): void } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec([...getOdaBaseSchemaSql(), ...getOdaSuggestSchemaSql()].join(';\n'));
  return { sqlite, close: () => sqlite.close() };
}

export interface OdaSeedRows {
  addresses?: OdaMemoryAddressRow[];
  postalCentroids?: OdaMemoryDb['postalCentroids'];
  cityCentroids?: OdaMemoryDb['cityCentroids'];
  streetRanges?: OdaMemoryDb['streetRanges'];
}

/** Insert fixture rows with the exact column names from `src/oda-schema.ts`. */
export function seedOdaRows(sqlite: DatabaseSync, rows: OdaSeedRows): void {
  const insertAddress = sqlite.prepare(`
    INSERT INTO oda_addresses (
      id, province, civic_number, street_name, street_type, street_direction, unit,
      postal_code, city, city_key, lat, lon, full_address, search_key, street_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows.addresses ?? []) {
    insertAddress.run(
      row.id,
      row.province,
      row.civic_number,
      row.street_name,
      row.street_type,
      row.street_direction,
      row.unit,
      row.postal_code,
      row.city,
      row.city_key,
      row.lat,
      row.lon,
      row.full_address,
      row.search_key,
      row.street_key
    );
  }

  const insertPostal = sqlite.prepare(`
    INSERT INTO oda_postal_centroids (province, postal_code, lat, lon, address_count)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const centroid of rows.postalCentroids?.values() ?? []) {
    insertPostal.run(
      centroid.province,
      centroid.postal_code,
      centroid.lat,
      centroid.lon,
      1
    );
  }

  const insertCity = sqlite.prepare(`
    INSERT INTO oda_city_centroids (province, city_key, city, lat, lon, address_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const centroid of rows.cityCentroids?.values() ?? []) {
    insertCity.run(
      centroid.province,
      centroid.city_key,
      centroid.city,
      centroid.lat,
      centroid.lon,
      1
    );
  }

  const insertRange = sqlite.prepare(`
    INSERT INTO oda_street_ranges
      (province, city_key, street_key, min_civic, max_civic, lat, lon, address_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const range of rows.streetRanges?.values() ?? []) {
    insertRange.run(
      range.province,
      range.city_key,
      range.street_key,
      null,
      null,
      range.lat,
      range.lon,
      1
    );
  }
}

export interface OdaStreetSuggestSeed {
  province: string;
  city_key: string;
  street_key: string;
  city: string;
  suggest_text: string;
  min_civic?: number | null;
  max_civic?: number | null;
  lat: number;
  lon: number;
  address_count: number;
}

/**
 * Seed the autocomplete tables directly. The fixture's street ranges cannot feed
 * `buildSuggestPopulateSql` (its centroid summary predates the suggest index), so tests that
 * exercise the FTS query state their container rows explicitly.
 */
export function seedStreetSuggest(sqlite: DatabaseSync, rows: OdaStreetSuggestSeed[]): void {
  const insert = sqlite.prepare(`
    INSERT INTO oda_street_suggest
      (province, city_key, street_key, city, suggest_text, min_civic, max_civic, lat, lon, address_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    insert.run(
      row.province,
      row.city_key,
      row.street_key,
      row.city,
      row.suggest_text,
      row.min_civic ?? null,
      row.max_civic ?? null,
      row.lat,
      row.lon,
      row.address_count
    );
  }
  sqlite.exec(
    `INSERT INTO oda_suggest_fts(rowid, suggest_text)
       SELECT id, suggest_text FROM oda_street_suggest`
  );
}

export interface OdaSqliteEnv {
  /** Fixture summary, kept for tests that assert the parser loaded every row. */
  db: OdaMemoryDb;
  d1: D1Database;
  sqlite: DatabaseSync;
  close(): void;
}

export interface OdaSqliteEnvOptions {
  fixturePath?: string;
  beforeRead?: () => void | Promise<void>;
}

/** A fresh in-memory database seeded from the ODA fixture CSV, with a D1-shaped shim. */
export function createOdaSqliteEnv(options: OdaSqliteEnvOptions = {}): OdaSqliteEnv {
  const { sqlite, close } = createOdaSqlite();
  const db = loadOdaFixtureDb(options.fixturePath);
  seedOdaRows(sqlite, db);
  const d1 = createD1Shim(sqlite, { beforeRead: options.beforeRead });
  return { db, d1, sqlite, close };
}

/**
 * Kept for the many existing `import { createOdaFixtureEnv } from './helpers/oda-memory-db'`
 * callers. Thin wrapper over `createOdaSqliteEnv` with the original positional signature.
 */
export function createOdaFixtureEnv(
  fixturePath?: string,
  options: { beforeRead?: () => void | Promise<void> } = {}
): OdaSqliteEnv {
  return createOdaSqliteEnv({ fixturePath, beforeRead: options.beforeRead });
}
