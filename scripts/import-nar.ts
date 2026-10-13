#!/usr/bin/env npx tsx
/**
 * Refresh one city's addresses in D1 from the StatCan National Address Register (NAR).
 *
 * The ODA importer is province-scoped and deletes a whole province before re-inserting. This is
 * its city-scoped counterpart: it replaces a single city's ODA rows in place, which is what makes
 * a one-city-per-day NAR migration possible without hammering D1.
 *
 * Since the June 2026 release a province ships as two split sets of files:
 *   Addresses/Address_<numeric-code>[_part_N].csv   civic/street/mailing fields
 *   Locations/Location_<numeric-code>[_part_N].csv   WGS84 lat/lon, keyed by LOC_GUID
 * so a refresh is three passes: collect the matching rows' LOC_GUIDs, resolve their coordinates,
 * then normalize and write. See docs/nar-data-import.md.
 *
 * Usage:
 *   npm run import:nar -- --city Toronto --province ON --remote --download
 *   npm run import:nar -- --next --remote            # next un-refreshed city from the queue
 *   npm run import:nar -- --list                     # queue status
 *   npm run import:nar -- --city Toronto --province ON --local --file test/fixtures/nar/fixture.csv
 */

import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import { basename, dirname, join } from 'path';
import { homedir } from 'os';
import { canonicalCityToken } from '../src/oda-city-aliases';
import {
  buildNarCityScope,
  matchesNarCity,
  narCoordinates,
  narRowCity,
  narRowProvince,
  normalizeNarRow,
  type NarCityScope,
  type NarCoordinates,
} from '../src/nar-normalize';
import {
  NAR_DEFAULTS,
  NAR_DELETE_CHUNK_ROWS,
  narZipUrl,
  normalizeSqlForCli,
  selectNarEntries,
  getNarSchemaSql,
  buildNarAddressDeleteChunkSql,
  buildNarCityCentroidDeleteSql,
  buildNarStreetRangeDeleteChunkSql,
  buildNarPostalRecomputeSql,
  buildNarProvenanceSql,
  buildNarCityKeysSql,
  parseNarCityQueue,
  pickNextNarCity,
  type NarCityQueueEntry,
} from '../src/nar-import';
import {
  prepareOdaInsertRow,
  buildAddressInsertSql,
  buildCentroidSqlStatements,
  trackCentroidsFromRow,
  escapeSql,
  type CentroidAccumulator,
} from '../src/oda-import';
import { PROVINCE_ID_TO_CODE, normalizeSearchToken } from '../src/oda-normalize';
import { buildSuggestPopulateCitiesSql } from '../src/oda-schema';

const NAR_PROVINCES = Array.from(new Set(Object.values(PROVINCE_ID_TO_CODE)));

/** Below this share of the existing rows, a refresh aborts rather than shrink a city. */
const DEFAULT_MIN_REPLACEMENT_RATIO = 0.5;
const POSTAL_RECOMPUTE_CHUNK = 400;
const PROGRESS_EVERY = 50_000;

interface ImportOptions {
  city?: string;
  province?: string;
  provincesCsv?: string;
  next: boolean;
  list: boolean;
  discoverCities: boolean;
  outputPath: string;
  minCount: number;
  file?: string;
  zip?: string;
  version: string;
  download: boolean;
  remote: boolean;
  database: string;
  batchSize: number;
  outputDir: string;
  queuePath: string;
  skipSchema: boolean;
  skipSuggest: boolean;
  maxRows?: number;
  dryRun: boolean;
  force: boolean;
  keepCsv: boolean;
}

function parseArgs(argv: string[]): ImportOptions {
  const options: ImportOptions = {
    next: false,
    list: false,
    discoverCities: false,
    outputPath: 'data/nar-cities.txt',
    minCount: 500,
    version: NAR_DEFAULTS.VERSION,
    download: false,
    remote: false,
    database: 'oda-addresses',
    batchSize: NAR_DEFAULTS.IMPORT_BATCH_SIZE,
    outputDir: '.nar-import',
    queuePath: 'data/nar-cities.txt',
    skipSchema: false,
    skipSuggest: false,
    dryRun: false,
    force: false,
    keepCsv: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--city' && argv[i + 1]) options.city = argv[++i];
    else if (arg === '--province' && argv[i + 1]) options.province = argv[++i].trim().toUpperCase();
    else if (arg === '--next') options.next = true;
    else if (arg === '--list') options.list = true;
    else if (arg === '--discover-cities') options.discoverCities = true;
    else if (arg === '--provinces' && argv[i + 1]) options.provincesCsv = argv[++i];
    else if (arg === '--output' && argv[i + 1]) options.outputPath = argv[++i];
    else if (arg === '--min-count' && argv[i + 1]) options.minCount = parseInt(argv[++i], 10);
    else if (arg === '--file' && argv[i + 1]) options.file = argv[++i];
    else if (arg === '--zip' && argv[i + 1]) options.zip = argv[++i];
    else if (arg === '--version' && argv[i + 1]) options.version = argv[++i].trim();
    else if (arg === '--download') options.download = true;
    else if (arg === '--remote') options.remote = true;
    else if (arg === '--local') options.remote = false;
    else if (arg === '--database' && argv[i + 1]) options.database = argv[++i];
    else if (arg === '--batch-size' && argv[i + 1]) options.batchSize = parseInt(argv[++i], 10);
    else if (arg === '--output-dir' && argv[i + 1]) options.outputDir = argv[++i];
    else if (arg === '--queue' && argv[i + 1]) options.queuePath = argv[++i];
    else if (arg === '--skip-schema') options.skipSchema = true;
    else if (arg === '--skip-suggest') options.skipSuggest = true;
    else if (arg === '--max-rows' && argv[i + 1]) options.maxRows = parseInt(argv[++i], 10);
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--keep-csv') options.keepCsv = true;
  }

  return options;
}

// ---------------------------------------------------------------------------
// CSV streaming (same parser as the ODA importer — NAR is RFC-4180-ish with quotes)
// ---------------------------------------------------------------------------

function parseCsvLine(line: string, headers: string[]): Record<string, string> {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current.trim());

  const row: Record<string, string> = {};
  headers.forEach((header, index) => {
    row[header.trim()] = (values[index] || '').trim();
  });
  return row;
}

async function* streamCsvRows(filePath: string, maxRows?: number): AsyncGenerator<Record<string, string>> {
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let headers: string[] | null = null;
  let yielded = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!headers) {
      // StatCan ships a UTF-8 BOM; without stripping it the first header becomes `\uFEFFLOC_GUID`.
      headers = line.replace(/^\uFEFF/, '').split(',').map((h) => h.trim());
      continue;
    }
    yield parseCsvLine(line, headers);
    yielded++;
    if (maxRows !== undefined && yielded >= maxRows) break;
  }
}

// ---------------------------------------------------------------------------
// D1 transport
// ---------------------------------------------------------------------------

/**
 * Writer seam with two implementations.
 *
 * The direct HTTP path exists because `wrangler d1 execute --file` goes through Cloudflare's
 * bulk-import endpoint, which returned `7009 Upstream service unavailable` on every attempt
 * during the first real Toronto run. The `/query` endpoint is reliable, is what the CLI uses for
 * `--command`, and accepts a multi-statement body (verified: 1,000 realistic INSERTs in one
 * request, ~0.9s). `wrangler --file` remains the fallback for `--local` and for environments with
 * no token available.
 */
interface D1Writer {
  execute(statements: string[], label: string): Promise<void>;
}

function terminateStatements(statements: string[]): string[] {
  // Some builders do not terminate their statements (`getNarSchemaSql`,
  // `buildSuggestPopulateCitiesSql`), and every transport needs each one delimited.
  return statements.map((statement) => (statement.trimEnd().endsWith(';') ? statement : `${statement};`));
}

function remoteFlag(remote: boolean): string {
  return remote ? '--remote' : '--local';
}

async function executeSqlFile(
  database: string,
  remote: boolean,
  filePath: string,
  maxAttempts = 5
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      execSync(`npx wrangler d1 execute ${database} ${remoteFlag(remote)} --file="${filePath}"`, {
        stdio: 'inherit',
      });
      return;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      const delayMs = Math.min(1000 * 2 ** attempt, 30_000);
      console.warn(`Batch failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }
}

function createWranglerWriter(database: string, remote: boolean, outputDir: string): D1Writer {
  return {
    async execute(statements, label) {
      if (statements.length === 0) return;
      const filePath = join(outputDir, `${label}.sql`);
      writeFileSync(filePath, terminateStatements(statements).join('\n'));
      try {
        await executeSqlFile(database, remote, filePath);
      } finally {
        try {
          unlinkSync(filePath);
        } catch {
          // ignore missing temp batch file
        }
      }
    },
  };
}

/** Reuse the token wrangler already holds rather than requiring a separately minted API token. */
function readWranglerOauthToken(): string | undefined {
  const path = join(homedir(), '.config', '.wrangler', 'config', 'default.toml');
  if (!existsSync(path)) return undefined;
  return readFileSync(path, 'utf-8').match(/^\s*oauth_token\s*=\s*"([^"]+)"/m)?.[1];
}

async function resolveDatabaseId(accountId: string, database: string, token: string): Promise<string> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database?name=${encodeURIComponent(database)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const body = (await response.json()) as { result?: Array<{ uuid?: string; name?: string }> };
  const match = body.result?.find((entry) => entry.name === database) ?? body.result?.[0];
  if (!match?.uuid) {
    throw new Error(`Could not resolve D1 database "${database}" for account ${accountId}`);
  }
  return match.uuid;
}

function createHttpWriter(config: {
  accountId: string;
  databaseId: string;
  token: string;
  maxAttempts?: number;
}): D1Writer {
  const { accountId, databaseId, token, maxAttempts = 8 } = config;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  return {
    async execute(statements, label) {
      if (statements.length === 0) return;
      const sql = terminateStatements(statements).join('\n');

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql }),
          });
          const body = (await response.json()) as {
            success?: boolean;
            errors?: Array<{ message?: string }>;
          };
          if (response.ok && body.success) return;
          const message =
            body.errors?.map((entry) => entry.message).filter(Boolean).join('; ') ||
            `HTTP ${response.status}`;
          throw new Error(message);
        } catch (error) {
          if (attempt === maxAttempts) {
            throw new Error(`D1 batch ${label} failed after ${maxAttempts} attempts: ${(error as Error).message}`, {
              cause: error,
            });
          }
          const delayMs = Math.min(1000 * 2 ** attempt, 30_000);
          console.warn(
            `D1 batch ${label} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms: ${(error as Error).message}`
          );
          await sleep(delayMs);
        }
      }
    },
  };
}

function queryD1Json<T>(database: string, remote: boolean, command: string): Array<{ results?: T[] }> {
  // `--command` reaches wrangler through the shell, and JSON.stringify turns a template literal's
  // newlines into a literal `\n` inside the SQL, which SQLite rejects. Collapse whitespace so any
  // multi-line statement is safe to pass.
  const sql = normalizeSqlForCli(command);
  const output = execSync(
    `npx wrangler d1 execute ${database} ${remoteFlag(remote)} --command ${JSON.stringify(sql)} --json`,
    { encoding: 'utf-8' }
  );
  return JSON.parse(output) as Array<{ results?: T[] }>;
}

function querySingleValue<T>(database: string, remote: boolean, command: string): T | undefined {
  return queryD1Json<T>(database, remote, command)[0]?.results?.[0];
}

function queryNextAddressId(database: string, remote: boolean): number {
  const row = querySingleValue<{ next_id: number }>(
    database,
    remote,
    'SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM oda_addresses;'
  );
  const nextId = row?.next_id;
  return typeof nextId === 'number' && nextId >= 1 ? nextId : 1;
}

function queryScopeRowCount(database: string, remote: boolean, province: string, scope: NarCityScope): number {
  const list = scope.cityKeys.map(escapeSql).join(', ');
  const row = querySingleValue<{ cnt: number }>(
    database,
    remote,
    `SELECT COUNT(*) AS cnt FROM oda_addresses WHERE province = ${escapeSql(province)} AND city_key IN (${list});`
  );
  return typeof row?.cnt === 'number' ? row.cnt : 0;
}

function queryScopeTableCount(
  database: string,
  remote: boolean,
  province: string,
  scope: NarCityScope,
  table: string
): number {
  const list = scope.cityKeys.map(escapeSql).join(', ');
  const row = querySingleValue<{ cnt: number }>(
    database,
    remote,
    `SELECT COUNT(*) AS cnt FROM ${table} WHERE province = ${escapeSql(province)} AND city_key IN (${list});`
  );
  return typeof row?.cnt === 'number' ? row.cnt : 0;
}

/**
 * Issue a bounded delete statement repeatedly. Each call removes at most `NAR_DELETE_CHUNK_ROWS`
 * rows, keeping every request inside D1's CPU budget; `iterations` is computed from a prior count
 * with a small buffer, and a chunk with nothing left to delete is a cheap no-op.
 */
async function deleteInChunks(
  writer: D1Writer,
  statement: string,
  iterations: number,
  label: string,
  describe: string
): Promise<void> {
  for (let index = 0; index < iterations; index++) {
    await writer.execute([statement], `${label}-${index}`);
    if ((index + 1) % 25 === 0 && index + 1 < iterations) {
      console.log(`  ${describe}: ${index + 1}/${iterations} chunks...`);
    }
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** The suggest rebuild uses `?` placeholders; wrangler d1 execute --file takes no bind parameters. */
function inlineParams(sql: string, params: string[]): string {
  let index = 0;
  return sql.replace(/\?/g, () => escapeSql(params[index++]));
}

// ---------------------------------------------------------------------------
// Run lock
// ---------------------------------------------------------------------------

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to another user; anything else means it is gone.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * A refresh runs for hours and two concurrent runs would race on the same rows: both would
 * delete and insert the same city, and the second delete could remove the first run's inserts.
 * A pid lockfile turns that from silent corruption into a refusal to start. The lock is keyed to
 * the staging directory, so it also survives a parent process being restarted underneath it.
 */
function acquireRunLock(outputDir: string): () => void {
  mkdirSync(outputDir, { recursive: true });
  const lockPath = join(outputDir, 'import-nar.lock');

  if (existsSync(lockPath)) {
    const pid = Number.parseInt(readFileSync(lockPath, 'utf-8').trim(), 10);
    if (Number.isFinite(pid) && pid > 0 && pid !== process.pid && isProcessAlive(pid)) {
      throw new Error(
        `Another NAR import is already running (pid ${pid}). Refusing to start a concurrent run; ` +
          `delete ${lockPath} if that process is gone.`
      );
    }
  }

  writeFileSync(lockPath, String(process.pid));
  const release = () => {
    try {
      if (readFileSync(lockPath, 'utf-8').trim() === String(process.pid)) unlinkSync(lockPath);
    } catch {
      // lock already gone
    }
  };
  process.on('exit', release);
  return release;
}

async function createWriter(options: ImportOptions): Promise<D1Writer> {
  if (options.dryRun) {
    return { async execute() {} };
  }
  if (!options.remote) {
    return createWranglerWriter(options.database, false, options.outputDir);
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN || readWranglerOauthToken();
  if (accountId && token) {
    try {
      const databaseId =
        process.env.ODA_DATABASE_ID || (await resolveDatabaseId(accountId, options.database, token));
      console.log(`Writing to remote D1 over the HTTP query API (database ${databaseId}).`);
      return createHttpWriter({ accountId, databaseId, token });
    } catch (error) {
      console.warn(
        `Direct D1 query API unavailable (${(error as Error).message}); falling back to wrangler --file.`
      );
    }
  }

  return createWranglerWriter(options.database, true, options.outputDir);
}

// ---------------------------------------------------------------------------
// NAR archive handling
// ---------------------------------------------------------------------------

function listZipEntries(zipPath: string): string[] {
  const output = execSync(`unzip -Z1 "${zipPath}"`, { encoding: 'utf-8' });
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function downloadNarZip(zipPath: string, version: string): void {
  mkdirSync(join(zipPath, '..'), { recursive: true });
  const url = narZipUrl(version);
  console.log(`Downloading NAR ${version} (${url})...`);
  execSync(`curl -fL --retry 5 --retry-delay 3 -C - -o "${zipPath}" "${url}"`, { stdio: 'inherit' });
  if (!existsSync(zipPath)) {
    throw new Error(`Download failed: ${zipPath} was not created`);
  }
}

function extractEntries(zipPath: string, entries: string[], outputDir: string, province: string): string[] {
  const targetDir = join(outputDir, basename(zipPath, '.zip'), province);
  mkdirSync(targetDir, { recursive: true });

  // `unzip -d` preserves the entry's own `Addresses/` or `Locations/` folder.
  const paths = entries.map((entry) => join(targetDir, entry.replace(/\\/g, '/')));
  const missing = paths.filter((path) => !existsSync(path) || statSync(path).size === 0);
  if (missing.length > 0) {
    console.log(`Extracting ${entries.length} NAR CSV(s) for ${province}...`);
    execSync(`unzip -o "${zipPath}" ${entries.map((e) => `"${e}"`).join(' ')} -d "${targetDir}"`, {
      stdio: 'inherit',
    });
  }

  return paths;
}

interface CsvSets {
  addressPaths: string[];
  locationPaths: string[];
}

function resolveCsvPaths(options: ImportOptions): CsvSets {
  if (options.file) {
    if (!existsSync(options.file)) throw new Error(`File not found: ${options.file}`);
    return { addressPaths: [options.file], locationPaths: [] };
  }

  const zipPath = options.zip ?? join(options.outputDir, `${options.version}.zip`);
  if (!existsSync(zipPath)) {
    if (!options.download) {
      throw new Error(
        `NAR archive not found at ${zipPath}. Re-run with --download (or pass --zip/--file).`
      );
    }
    downloadNarZip(zipPath, options.version);
  }

  const entries = listZipEntries(zipPath);
  const province = options.province!;
  return {
    addressPaths: extractEntries(zipPath, selectNarEntries(entries, 'Addresses', province), options.outputDir, province),
    locationPaths: extractEntries(zipPath, selectNarEntries(entries, 'Locations', province), options.outputDir, province),
  };
}

// ---------------------------------------------------------------------------
// City refresh
// ---------------------------------------------------------------------------

interface RefreshResult {
  matched: number;
  withCoordinates: number;
}

/** Pass 1: the matching rows' LOC_GUIDs, so pass 2 only keeps coordinates we will use. */
async function collectMatchedLocationGuids(
  options: ImportOptions,
  addressPaths: string[],
  scope: NarCityScope
): Promise<{ guids: Set<string>; matched: number }> {
  const guids = new Set<string>();
  let matched = 0;
  let remaining = options.maxRows;

  for (const csvPath of addressPaths) {
    if (remaining !== undefined && remaining <= 0) break;
    for await (const row of streamCsvRows(csvPath, remaining)) {
      if (remaining !== undefined) remaining--;
      if (narRowProvince(row) !== options.province) continue;
      if (!matchesNarCity(narRowCity(row), scope)) continue;
      matched++;
      const guid = (row.LOC_GUID ?? '').trim();
      if (guid) guids.add(guid);
    }
  }

  console.log(`  Pass 1: ${matched.toLocaleString()} matching rows, ${guids.size.toLocaleString()} locations`);
  return { guids, matched };
}

/** Pass 2: coordinates for just those locations, blockface first (see nar-normalize). */
async function resolveCoordinates(
  locationPaths: string[],
  needed: Set<string>
): Promise<Map<string, NarCoordinates>> {
  const coords = new Map<string, NarCoordinates>();
  for (const csvPath of locationPaths) {
    for await (const row of streamCsvRows(csvPath)) {
      const guid = (row.LOC_GUID ?? '').trim();
      if (!guid || !needed.has(guid) || coords.has(guid)) continue;
      const point = narCoordinates(row);
      if (point) coords.set(guid, point);
    }
  }
  console.log(`  Pass 2: resolved ${coords.size.toLocaleString()} of ${needed.size.toLocaleString()} locations`);
  return coords;
}

async function refreshCity(
  options: ImportOptions,
  writer: D1Writer,
  { addressPaths, locationPaths }: CsvSets,
  scope: NarCityScope
): Promise<RefreshResult> {
  const province = options.province!;
  const partial = options.maxRows !== undefined;
  mkdirSync(options.outputDir, { recursive: true });

  if (partial && options.remote && !options.force) {
    throw new Error(
      '--max-rows against --remote would leave a duplicate sample in the city; pass --force or run --local.'
    );
  }

  const existingRows = queryScopeRowCount(options.database, options.remote, province, scope);
  const rowIdStart = queryNextAddressId(options.database, options.remote);
  // The ids this run will use start at rowIdStart, so everything at or below rowIdStart - 1 is
  // previous-vintage data.
  const lastExistingId = rowIdStart - 1;
  console.log(`  Existing rows in scope: ${existingRows.toLocaleString()}`);

  const { guids: neededGuids, matched: matchedInScan } = await collectMatchedLocationGuids(
    options,
    addressPaths,
    scope
  );
  const coords =
    locationPaths.length > 0
      ? await resolveCoordinates(locationPaths, neededGuids)
      : new Map<string, NarCoordinates>();

  // Validate before any write: a wrong city name or a thin vintage must never delete live data.
  if (matchedInScan === 0) {
    throw new Error(`No rows matched city "${options.city}" in province ${province}; nothing written.`);
  }
  if (
    !partial &&
    existingRows > 0 &&
    matchedInScan < existingRows * DEFAULT_MIN_REPLACEMENT_RATIO &&
    !options.force
  ) {
    throw new Error(
      `Refusing to shrink ${options.city}: matched ${matchedInScan.toLocaleString()} of ` +
        `${existingRows.toLocaleString()} existing rows (< ${Math.round(DEFAULT_MIN_REPLACEMENT_RATIO * 100)}%); ` +
        'pass --force to override.'
    );
  }

  const cityCentroids = new Map<string, CentroidAccumulator & { city: string }>();
  const streetRanges = new Map<string, CentroidAccumulator & { streetKey: string; cityKey: string }>();
  const touchedPostalCodes = new Set<string>();
  // Postal centres are recomputed from the whole table, so the per-row accumulator is unused —
  // but trackCentroidsFromRow still needs somewhere to put it.
  const ignoredPostalCentroids = new Map<string, CentroidAccumulator>();

  if (!options.dryRun && !partial) {
    // Retire the previous vintage before inserting so the city is never double-served. The
    // validation above already proved replacement rows exist, so this cannot empty a city that
    // has nothing to replace it with.
    await deleteInChunks(
      writer,
      buildNarAddressDeleteChunkSql(province, scope, lastExistingId),
      Math.ceil(existingRows / NAR_DELETE_CHUNK_ROWS) + 2,
      `nar-${scope.canonicalToken}-delete`,
      `retiring previous rows for ${options.city}`
    );
    await writer.execute(
      [buildNarCityCentroidDeleteSql(province, scope)],
      `nar-${scope.canonicalToken}-centroids-delete`
    );
    const streetRangeCount = queryScopeTableCount(
      options.database,
      options.remote,
      province,
      scope,
      'oda_street_ranges'
    );
    if (streetRangeCount > 0) {
      await deleteInChunks(
        writer,
        buildNarStreetRangeDeleteChunkSql(province, scope),
        Math.ceil(streetRangeCount / NAR_DELETE_CHUNK_ROWS) + 2,
        `nar-${scope.canonicalToken}-ranges-delete`,
        `retiring old street ranges for ${options.city}`
      );
    }
  }

  let batch: string[] = [];
  let rowId = rowIdStart;
  let withCoordinates = 0;
  let missingCoordinates = 0;
  let remaining = options.maxRows;
  let batchIndex = 0;

  // Pass 3: normalize with coordinates, accumulate aggregates, and write address rows.
  for (const csvPath of addressPaths) {
    if (remaining !== undefined && remaining <= 0) break;
    for await (const row of streamCsvRows(csvPath, remaining)) {
      if (remaining !== undefined) remaining--;
      if (narRowProvince(row) !== province) continue;
      if (!matchesNarCity(narRowCity(row), scope)) continue;

      const guid = (row.LOC_GUID ?? '').trim();
      const normalized = normalizeNarRow(row, coords.get(guid));
      if (!normalized) {
        missingCoordinates++;
        continue;
      }
      withCoordinates++;
      if (normalized.postalCode) touchedPostalCodes.add(normalized.postalCode);
      trackCentroidsFromRow(normalized, ignoredPostalCentroids, cityCentroids, streetRanges);

      if (options.dryRun) continue;

      batch.push(buildAddressInsertSql(prepareOdaInsertRow(normalized), rowId));
      rowId++;

      if (batch.length >= options.batchSize) {
        await writer.execute(batch, `nar-${scope.canonicalToken}-addresses-${batchIndex}`);
        batch = [];
        batchIndex++;
      }

      if (withCoordinates % PROGRESS_EVERY === 0) {
        console.log(`  Pass 3: ${withCoordinates.toLocaleString()} addresses written...`);
      }
    }
  }

  console.log(
    `  Pass 3: ${withCoordinates.toLocaleString()} addresses with coordinates` +
      (missingCoordinates > 0 ? `, ${missingCoordinates.toLocaleString()} skipped without` : '')
  );

  if (options.dryRun) {
    return { matched: matchedInScan, withCoordinates };
  }

  if (batch.length > 0) {
    await writer.execute(batch, `nar-${scope.canonicalToken}-addresses-${batchIndex}`);
  }

  if (partial) {
    console.warn(
      `--max-rows is set (${options.maxRows}): wrote a sample only; skipped centroids and suggest rebuild.`
    );
    return { matched: matchedInScan, withCoordinates };
  }

  // City + street aggregates are city-scoped, so replace them outright from the NAR scan.
  const centroidStatements = buildCentroidSqlStatements(
    province,
    new Map<string, CentroidAccumulator>(),
    cityCentroids,
    streetRanges
  );
  for (const [index, statements] of chunk(centroidStatements, options.batchSize).entries()) {
    await writer.execute(statements, `nar-${scope.canonicalToken}-centroids-${index}`);
  }

  // Postal centroids are not city-scoped: recompute the touched ones from the whole table.
  for (const [index, codes] of chunk(Array.from(touchedPostalCodes), POSTAL_RECOMPUTE_CHUNK).entries()) {
    await writer.execute(
      buildNarPostalRecomputeSql(province, codes),
      `nar-${scope.canonicalToken}-postal-${index}`
    );
  }

  if (!options.skipSuggest && (await suggestIndexExists(options))) {
    try {
      const statements = buildSuggestPopulateCitiesSql(province, scope.cityKeys).map(({ sql, params }) =>
        inlineParams(sql, params)
      );
      await writer.execute(statements, `nar-${scope.canonicalToken}-suggest`);
      console.log('  Rebuilt the autocomplete index for the refreshed city.');
    } catch (error) {
      // The city's data is already migrated; a failed index rebuild is recoverable out of band.
      console.warn(
        `  Autocomplete rebuild failed (${(error as Error).message}); run ` +
          `npm run build:oda:suggest -- --provinces ${province} --remote --skip-schema later.`
      );
    }
  }

  await writer.execute(
    [
      buildNarProvenanceSql({
        province,
        scope,
        city: options.city!,
        version: options.version,
        sourceUrl: options.file ? `file:${options.file}` : narZipUrl(options.version),
        rowCount: withCoordinates,
      }),
    ],
    `nar-${scope.canonicalToken}-provenance`
  );
  await writer.execute(
    buildNarCityKeysSql(province, scope, options.version),
    `nar-${scope.canonicalToken}-city-keys`
  );

  console.log(
    `Refreshed ${options.city} (${province}): ${withCoordinates.toLocaleString()} NAR rows replaced ` +
      `${existingRows.toLocaleString()} existing rows.`
  );
  return { matched: matchedInScan, withCoordinates };
}

async function suggestIndexExists(options: ImportOptions): Promise<boolean> {
  try {
    const row = querySingleValue<{ name: string }>(
      options.database,
      options.remote,
      `SELECT name FROM sqlite_master WHERE type='table' AND name='oda_street_suggest' LIMIT 1;`
    );
    return Boolean(row?.name);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

function readQueue(path: string): NarCityQueueEntry[] {
  if (!existsSync(path)) throw new Error(`Queue file not found: ${path}`);
  return parseNarCityQueue(readFileSync(path, 'utf-8'));
}

function queueKey(entry: NarCityQueueEntry): string {
  return `${entry.province}|${normalizeSearchToken(entry.city)}`;
}

interface ProvenanceRow {
  province: string;
  city_key: string;
  city: string;
  nar_version: string;
  row_count: number;
  finished_at: string | null;
}

function readProvenance(options: ImportOptions): ProvenanceRow[] {
  const exists = querySingleValue<{ name: string }>(
    options.database,
    options.remote,
    `SELECT name FROM sqlite_master WHERE type='table' AND name='nar_city_imports' LIMIT 1;`
  );
  if (!exists?.name) return [];
  return (
    queryD1Json<ProvenanceRow>(
      options.database,
      options.remote,
      `SELECT province, city_key, city, nar_version, row_count, finished_at
       FROM nar_city_imports WHERE nar_version = ${escapeSql(options.version)}`
    )[0]?.results ?? []
  );
}

function canonicalTokenFromCityKey(cityKey: string): string {
  return cityKey.slice(0, cityKey.lastIndexOf('|'));
}

function completedQueueKeys(rows: ProvenanceRow[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    if (!row.finished_at) continue;
    keys.add(`${row.province}|${canonicalTokenFromCityKey(row.city_key)}`);
  }
  return keys;
}

function runList(options: ImportOptions): void {
  const entries = readQueue(options.queuePath);
  const rows = readProvenance(options);
  const byKey = new Map(
    rows.map((row) => [`${row.province}|${canonicalTokenFromCityKey(row.city_key)}`, row])
  );

  console.log(`NAR queue (${options.queuePath}) — vintage ${options.version}\n`);
  console.log(`${'PROV'.padEnd(5)} ${'CITY'.padEnd(24)} ${'STATUS'.padEnd(9)} ROWS      FINISHED`);
  for (const entry of entries) {
    const row = byKey.get(queueKey(entry));
    const status = row?.finished_at ? 'done' : 'pending';
    console.log(
      `${entry.province.padEnd(5)} ${entry.city.padEnd(24)} ${status.padEnd(9)} ` +
        `${String(row?.row_count ?? '').padEnd(9)} ${row?.finished_at ?? ''}`
    );
  }
}

// ---------------------------------------------------------------------------
// City discovery
// ---------------------------------------------------------------------------

function titleCaseToken(token: string): string {
  return token.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, separator: string, char: string) => separator + char.toUpperCase());
}

/**
 * Derive the daily queue from the NAR itself: count addresses per municipality, fold the
 * pre-amalgamation spellings to their canonical city, and write the result ordered by count.
 *
 * The point is that names in the queue can never silently match nothing — they come from
 * `MAIL_MUN_NAME` verbatim. Only the address CSVs are read; coordinates are irrelevant here.
 */
async function discoverCities(options: ImportOptions, provinces: string[]): Promise<void> {
  const zipPath = options.zip ?? join(options.outputDir, `${options.version}.zip`);
  if (!existsSync(zipPath)) {
    if (!options.download) {
      throw new Error(`NAR archive not found at ${zipPath}. Re-run with --download.`);
    }
    downloadNarZip(zipPath, options.version);
  }

  const entries = listZipEntries(zipPath);
  const counts = new Map<string, { province: string; token: string; count: number }>();

  for (const province of provinces) {
    const paths = extractEntries(zipPath, selectNarEntries(entries, 'Addresses', province), options.outputDir, province);
    for (const csvPath of paths) {
      for await (const row of streamCsvRows(csvPath)) {
        if (narRowProvince(row) !== province) continue;
        const token = canonicalCityToken(narRowCity(row), province);
        if (!token) continue;
        const key = `${province}|${token}`;
        const entry = counts.get(key) ?? { province, token, count: 0 };
        entry.count++;
        counts.set(key, entry);
      }
      console.log(`  ${province}: scanned ${basename(csvPath)}`);
    }

    // Clean up per province: scanning every province at once would otherwise need the whole
    // national CSV set (~5 GB) on disk before the first delete.
    if (!options.keepCsv && !options.file) {
      for (const path of paths) {
        try {
          unlinkSync(path);
        } catch {
          // already gone
        }
      }
    }
  }

  const selected = [...counts.values()]
    .filter((entry) => entry.count >= options.minCount)
    .sort((a, b) => b.count - a.count);

  const header = [
    '# NAR city queue — generated by `npm run import:nar -- --discover-cities`',
    '#',
    '# Format: PROVINCE<TAB>City — one per line. The runner refreshes the first entry with no',
    '# completed import for the current NAR vintage (npm run import:nar -- --next --remote).',
    '# Ordered by address count; edit freely — this file IS the schedule.',
    `# Vintage ${options.version}; provinces ${provinces.join(', ')}; min count ${options.minCount}`,
    '',
  ];
  const lines = selected.map((entry) => `${entry.province}\t${titleCaseToken(entry.token)}`);

  mkdirSync(dirname(options.outputPath), { recursive: true });
  writeFileSync(options.outputPath, [...header, ...lines, ''].join('\n'));
  console.log(`Wrote ${selected.length.toLocaleString()} cities to ${options.outputPath}`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.discoverCities) {
    const provinces = options.provincesCsv
      ? options.provincesCsv.toUpperCase() === 'ALL'
        ? [...NAR_PROVINCES]
        : options.provincesCsv
            .split(',')
            .map((p) => p.trim().toUpperCase())
            .filter(Boolean)
      : options.province
        ? [options.province]
        : [...NAR_PROVINCES];
    const unknown = provinces.filter((p) => !NAR_PROVINCES.includes(p));
    if (unknown.length > 0) {
      throw new Error(`Unknown province(s) for discovery: ${unknown.join(', ')}`);
    }
    await discoverCities(options, provinces);
    return;
  }

  if (options.list) {
    runList(options);
    return;
  }

  if (options.next) {
    const entries = readQueue(options.queuePath);
    const completed = completedQueueKeys(readProvenance(options));
    const entry = pickNextNarCity(entries, completed);
    if (!entry) {
      console.log(`Queue complete for NAR ${options.version} — every city has been refreshed.`);
      return;
    }
    options.city = entry.city;
    options.province = entry.province;
    console.log(`Next: ${entry.city} (${entry.province})`);
  }

  if (!options.city || !options.province) {
    throw new Error('Provide --city and --province, or use --next / --list.');
  }
  if (!NAR_PROVINCES.includes(options.province)) {
    throw new Error(`Unknown province "${options.province}". Expected one of: ${NAR_PROVINCES.join(', ')}`);
  }

  const scope = buildNarCityScope(options.city, options.province);
  const writer = await createWriter(options);
  const releaseLock = acquireRunLock(options.outputDir);
  try {
    if (!options.dryRun && !options.skipSchema) {
      console.log(`Ensuring NAR tables exist (${options.remote ? 'remote' : 'local'})...`);
      await writer.execute(getNarSchemaSql(), 'nar-schema');
    }

    const csvSets = resolveCsvPaths(options);
    try {
      await refreshCity(options, writer, csvSets, scope);
    } finally {
      if (!options.keepCsv && !options.file) {
        for (const path of [...csvSets.addressPaths, ...csvSets.locationPaths]) {
          try {
            unlinkSync(path);
          } catch {
            // extracted CSV may already be gone
          }
        }
      }
    }
  } finally {
    releaseLock();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
