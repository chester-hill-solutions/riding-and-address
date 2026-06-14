#!/usr/bin/env npx tsx
/**
 * Import ODA CSV data into Cloudflare D1.
 *
 * Usage:
 *   npm run import:oda -- --download --provinces ON --remote
 *   npm run import:oda -- --provinces ON,QC --file test/fixtures/oda/fixture.csv
 *   npm run import:oda -- --provinces ON --remote --database oda-addresses
 */

import { createReadStream, mkdirSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
import { join } from 'path';
import { normalizeOdaCsvRow } from '../src/oda-normalize';
import { getOdaBaseSchemaSql } from '../src/oda-schema';
import {
  prepareOdaInsertRow,
  buildAddressInsertSql,
  buildCentroidSqlStatements,
  trackCentroidsFromRow,
  PROVINCE_DOWNLOAD_URLS,
  ODA_DEFAULTS,
  type CentroidAccumulator,
} from '../src/oda-import';

interface ImportOptions {
  provinces: string[];
  file?: string;
  download: boolean;
  remote: boolean;
  database: string;
  batchSize: number;
  outputDir: string;
  skipSchema: boolean;
  maxRows?: number;
}

function parseArgs(argv: string[]): ImportOptions {
  const options: ImportOptions = {
    provinces: ['ON', 'QC'],
    download: false,
    remote: false,
    database: 'oda-addresses',
    batchSize: ODA_DEFAULTS.IMPORT_BATCH_SIZE,
    outputDir: '.oda-import',
    skipSchema: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--provinces' && argv[i + 1]) {
      options.provinces = argv[++i].split(',').map((p) => p.trim().toUpperCase());
    } else if (arg === '--file' && argv[i + 1]) {
      options.file = argv[++i];
    } else if (arg === '--download') {
      options.download = true;
    } else if (arg === '--remote') {
      options.remote = true;
    } else if (arg === '--database' && argv[i + 1]) {
      options.database = argv[++i];
    } else if (arg === '--batch-size' && argv[i + 1]) {
      options.batchSize = parseInt(argv[++i], 10);
    } else if (arg === '--output-dir' && argv[i + 1]) {
      options.outputDir = argv[++i];
    } else if (arg === '--skip-schema') {
      options.skipSchema = true;
    } else if (arg === '--max-rows' && argv[i + 1]) {
      options.maxRows = parseInt(argv[++i], 10);
    }
  }

  return options;
}

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

async function* streamCsvRows(
  filePath: string,
  maxRows?: number
): AsyncGenerator<Record<string, string>> {
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let headers: string[] | null = null;
  let yielded = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!headers) {
      headers = line.split(',').map((h) => h.trim());
      continue;
    }
    yield parseCsvLine(line, headers);
    yielded++;
    if (maxRows !== undefined && yielded >= maxRows) break;
  }
}

function executeSqlFile(database: string, remote: boolean, filePath: string): void {
  const remoteFlag = remote ? '--remote' : '--local';
  execSync(`npx wrangler d1 execute ${database} ${remoteFlag} --file=${filePath}`, {
    stdio: 'inherit',
  });
}

function writeAndExecuteBatch(
  database: string,
  remote: boolean,
  statements: string[],
  filePath: string
): void {
  if (statements.length === 0) return;
  writeFileSync(filePath, statements.join('\n'));
  executeSqlFile(database, remote, filePath);
  unlinkSync(filePath);
}

function queryNextAddressId(database: string, remote: boolean): number {
  const remoteFlag = remote ? '--remote' : '--local';
  const output = execSync(
    `npx wrangler d1 execute ${database} ${remoteFlag} --command "SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM oda_addresses;" --json`,
    { encoding: 'utf-8' }
  );
  const parsed = JSON.parse(output) as Array<{ results?: Array<{ next_id?: number }> }>;
  const nextId = parsed[0]?.results?.[0]?.next_id;
  if (typeof nextId !== 'number' || nextId < 1) {
    return 1;
  }
  return nextId;
}

function initializeSchema(options: ImportOptions): void {
  mkdirSync(options.outputDir, { recursive: true });
  const schemaPath = join(options.outputDir, 'schema.sql');
  writeFileSync(schemaPath, getOdaBaseSchemaSql().join(';\n') + ';\n');
  console.log(`Initializing ODA tables (${options.remote ? 'remote' : 'local'})...`);
  executeSqlFile(options.database, options.remote, schemaPath);
}

function buildProvinceDeleteSql(province: string): string[] {
  return [
    `DELETE FROM oda_addresses WHERE province = '${province}';`,
    `DELETE FROM oda_postal_centroids WHERE province = '${province}';`,
    `DELETE FROM oda_city_centroids WHERE province = '${province}';`,
    `DELETE FROM oda_street_ranges WHERE province = '${province}';`,
  ];
}

function downloadProvinceCsv(province: string, outputDir: string): string {
  const url = PROVINCE_DOWNLOAD_URLS[province];
  if (!url) {
    throw new Error(`No download URL configured for province ${province}`);
  }

  const provinceDir = join(outputDir, province);
  mkdirSync(provinceDir, { recursive: true });
  const zipPath = join(provinceDir, `ODA_${province}_v1.zip`);
  const csvPath = join(provinceDir, `ODA_${province}_v1.csv`);

  if (!existsSync(csvPath)) {
    if (!existsSync(zipPath)) {
      console.log(`Downloading ${province} ODA from StatCan (${url})...`);
      execSync(`curl -fsSL "${url}" -o "${zipPath}"`, { stdio: 'inherit' });
    }
    console.log(`Extracting ${zipPath}...`);
    execSync(`unzip -o "${zipPath}" "ODA_${province}_v1.csv" -d "${provinceDir}"`, {
      stdio: 'inherit',
    });
  }

  if (!existsSync(csvPath)) {
    throw new Error(`Expected CSV at ${csvPath} after extraction`);
  }

  return csvPath;
}

function resolveCsvPath(province: string, options: ImportOptions): string {
  if (options.download) {
    return downloadProvinceCsv(province, options.outputDir);
  }
  if (!options.file) {
    throw new Error('Provide --file or use --download');
  }
  if (!existsSync(options.file)) {
    throw new Error(`File not found: ${options.file}`);
  }
  return options.file;
}

async function flushCentroids(
  province: string,
  options: ImportOptions,
  postalCentroids: Map<string, CentroidAccumulator>,
  cityCentroids: Map<string, CentroidAccumulator & { city: string }>,
  streetRanges: Map<string, CentroidAccumulator & { streetKey: string; cityKey: string }>,
  batchIndex: number
): Promise<number> {
  const statements = buildCentroidSqlStatements(
    province,
    postalCentroids,
    cityCentroids,
    streetRanges
  );
  if (statements.length === 0) return batchIndex;

  let chunk: string[] = [];
  let index = batchIndex;

  for (const statement of statements) {
    chunk.push(statement);
    if (chunk.length >= options.batchSize) {
      const filePath = join(options.outputDir, `${province}-centroids-${index}.sql`);
      writeAndExecuteBatch(options.database, options.remote, chunk, filePath);
      chunk = [];
      index++;
    }
  }

  if (chunk.length > 0) {
    const filePath = join(options.outputDir, `${province}-centroids-${index}.sql`);
    writeAndExecuteBatch(options.database, options.remote, chunk, filePath);
    index++;
  }

  return index;
}

async function importProvinceFromFile(
  province: string,
  csvPath: string,
  options: ImportOptions,
  startId: number
): Promise<{ imported: number; nextId: number }> {
  mkdirSync(options.outputDir, { recursive: true });

  const postalCentroids = new Map<string, CentroidAccumulator>();
  const cityCentroids = new Map<string, CentroidAccumulator & { city: string }>();
  const streetRanges = new Map<string, CentroidAccumulator & { streetKey: string; cityKey: string }>();

  let batch: string[] = buildProvinceDeleteSql(province);
  let rowId = startId;
  let imported = 0;
  let skipped = 0;
  let batchIndex = 0;
  const progressEvery = 100_000;

  console.log(`Importing ${province} from ${csvPath}...`);

  for await (const csvRow of streamCsvRows(csvPath, options.maxRows)) {
    const normalized = normalizeOdaCsvRow(csvRow);
    if (!normalized || normalized.province !== province) {
      skipped++;
      continue;
    }

    trackCentroidsFromRow(normalized, postalCentroids, cityCentroids, streetRanges);
    const insertRow = prepareOdaInsertRow(normalized);
    batch.push(buildAddressInsertSql(insertRow, rowId));
    rowId++;
    imported++;

    if (batch.length >= options.batchSize) {
      const filePath = join(options.outputDir, `${province}-addresses-${batchIndex}.sql`);
      writeAndExecuteBatch(options.database, options.remote, batch, filePath);
      batch = [];
      batchIndex++;
    }

    if (imported > 0 && imported % progressEvery === 0) {
      console.log(`  ${province}: ${imported.toLocaleString()} addresses imported...`);
    }
  }

  if (imported === 0) {
    console.warn(`No rows imported for province ${province} (skipped ${skipped.toLocaleString()} rows)`);
    return { imported: 0, nextId: startId };
  }

  if (batch.length > 0) {
    const filePath = join(options.outputDir, `${province}-addresses-${batchIndex}.sql`);
    writeAndExecuteBatch(options.database, options.remote, batch, filePath);
    batchIndex++;
  }

  batchIndex = await flushCentroids(
    province,
    options,
    postalCentroids,
    cityCentroids,
    streetRanges,
    batchIndex
  );

  const metadataPath = join(options.outputDir, `${province}-metadata.sql`);
  writeAndExecuteBatch(
    options.database,
    options.remote,
    [
      `INSERT INTO oda_imports (province, source_url, source_version, row_count, finished_at) VALUES ('${province}', '${PROVINCE_DOWNLOAD_URLS[province] || ''}', '${ODA_DEFAULTS.DATA_VERSION}', ${imported}, datetime('now'));`,
    ],
    metadataPath
  );

  console.log(
    `Imported ${imported.toLocaleString()} addresses for ${province} (skipped ${skipped.toLocaleString()} rows)`
  );
  return { imported, nextId: rowId };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!options.download && !options.file) {
    console.error('Provide --file path to ODA CSV or use --download to fetch from StatCan');
    process.exit(1);
  }

  if (!options.skipSchema) {
    initializeSchema(options);
  }

  let nextId = queryNextAddressId(options.database, options.remote);

  for (const province of options.provinces) {
    const csvPath = resolveCsvPath(province, options);
    const result = await importProvinceFromFile(province, csvPath, options, nextId);
    nextId = result.nextId;
  }

  console.log('Import complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
