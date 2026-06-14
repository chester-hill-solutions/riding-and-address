#!/usr/bin/env npx tsx
/**
 * Import ODA CSV data into Cloudflare D1.
 *
 * Usage:
 *   npm run import:oda -- --provinces ON,QC --file test/fixtures/oda/fixture.csv
 *   npm run import:oda -- --provinces ON --remote --database oda-addresses
 */

import { createReadStream, mkdirSync, writeFileSync, existsSync } from 'fs';
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
  remote: boolean;
  database: string;
  batchSize: number;
  outputDir: string;
  skipSchema: boolean;
}

function parseArgs(argv: string[]): ImportOptions {
  const options: ImportOptions = {
    provinces: ['ON', 'QC'],
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

async function readCsvRows(filePath: string): Promise<Record<string, string>[]> {
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let headers: string[] | null = null;
  const rows: Record<string, string>[] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!headers) {
      headers = line.split(',').map((h) => h.trim());
      continue;
    }
    rows.push(parseCsvLine(line, headers));
  }

  return rows;
}

function executeSqlFile(database: string, remote: boolean, filePath: string): void {
  const remoteFlag = remote ? '--remote' : '--local';
  execSync(`npx wrangler d1 execute ${database} ${remoteFlag} --file=${filePath}`, {
    stdio: 'inherit',
  });
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

async function importProvinceFromRows(
  province: string,
  csvRows: Record<string, string>[],
  options: ImportOptions,
  startId: number
): Promise<{ imported: number; nextId: number }> {
  mkdirSync(options.outputDir, { recursive: true });

  const normalizedRows = csvRows
    .map(normalizeOdaCsvRow)
    .filter((row): row is NonNullable<typeof row> => row !== null && row.province === province);

  if (normalizedRows.length === 0) {
    console.warn(`No rows for province ${province}`);
    return { imported: 0, nextId: startId };
  }

  const postalCentroids = new Map<string, CentroidAccumulator>();
  const cityCentroids = new Map<string, CentroidAccumulator & { city: string }>();
  const streetRanges = new Map<string, CentroidAccumulator & { streetKey: string; cityKey: string }>();

  let batch: string[] = buildProvinceDeleteSql(province);

  let rowId = startId;
  let imported = 0;

  for (const normalized of normalizedRows) {
    trackCentroidsFromRow(normalized, postalCentroids, cityCentroids, streetRanges);
    const insertRow = prepareOdaInsertRow(normalized);
    batch.push(buildAddressInsertSql(insertRow, rowId));
    rowId++;
    imported++;

    if (batch.length >= options.batchSize) {
      const filePath = join(options.outputDir, `${province}-batch-${imported}.sql`);
      writeFileSync(filePath, batch.join('\n'));
      executeSqlFile(options.database, options.remote, filePath);
      batch = [];
    }
  }

  batch.push(...buildCentroidSqlStatements(province, postalCentroids, cityCentroids, streetRanges));
  batch.push(
    `INSERT INTO oda_imports (province, source_url, source_version, row_count, finished_at) VALUES ('${province}', '${PROVINCE_DOWNLOAD_URLS[province] || ''}', '${ODA_DEFAULTS.DATA_VERSION}', ${imported}, datetime('now'));`
  );

  const finalPath = join(options.outputDir, `${province}-final.sql`);
  writeFileSync(finalPath, batch.join('\n'));
  executeSqlFile(options.database, options.remote, finalPath);

  console.log(`Imported ${imported} addresses for ${province}`);
  return { imported, nextId: rowId };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!options.file) {
    console.error('Provide --file path to ODA CSV (or fixture CSV for testing)');
    process.exit(1);
  }

  if (!existsSync(options.file)) {
    console.error(`File not found: ${options.file}`);
    process.exit(1);
  }

  if (!options.skipSchema) {
    initializeSchema(options);
  }

  console.log(`Reading ${options.file}...`);
  const rows = await readCsvRows(options.file);

  let nextId = 1;
  for (const province of options.provinces) {
    const result = await importProvinceFromRows(province, rows, options, nextId);
    nextId = result.nextId;
  }

  console.log('Import complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
