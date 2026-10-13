/**
 * ODA fixture parser and summary.
 *
 * There is deliberately no in-memory adapter here any more: the D1 adapter's real SQL runs
 * against in-memory SQLite in `test/helpers/oda-sqlite.ts`, seeded from the rows this module
 * parses. Keeping the parser separate is what lets the fixture feed the real statements without
 * a second, hand-written ranking that can drift from them.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeOdaCsvRow } from '../../src/oda-normalize';
import {
  prepareOdaInsertRow,
  trackCentroidsFromRow,
  type CentroidAccumulator,
} from '../../src/oda-import';

export interface OdaMemoryAddressRow {
  id: number;
  province: string;
  civic_number: string;
  street_name: string;
  street_type: string;
  street_direction: string;
  unit: string;
  postal_code: string;
  city: string;
  city_key: string;
  lat: number;
  lon: number;
  full_address: string;
  search_key: string;
  street_key: string;
}

export interface OdaMemoryDb {
  addresses: OdaMemoryAddressRow[];
  postalCentroids: Map<string, { province: string; postal_code: string; lat: number; lon: number }>;
  cityCentroids: Map<string, { province: string; city_key: string; city: string; lat: number; lon: number }>;
  streetRanges: Map<
    string,
    { province: string; city_key: string; street_key: string; lat: number; lon: number }
  >;
}

export { createOdaFixtureEnv, createOdaSqliteEnv } from './oda-sqlite';

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
    row[header.trim()] = values[index] ?? '';
  });
  return row;
}

export function loadOdaFixtureDb(fixturePath?: string): OdaMemoryDb {
  const path = fixturePath ?? join(process.cwd(), 'test/fixtures/oda/fixture.csv');
  const content = readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  const headers = lines[0].split(',').map((h) => h.trim());

  const postalCentroids = new Map<string, CentroidAccumulator>();
  const cityCentroids = new Map<string, CentroidAccumulator & { city: string }>();
  const streetRanges = new Map<string, CentroidAccumulator & { streetKey: string; cityKey: string }>();

  const addresses: OdaMemoryAddressRow[] = [];
  let id = 1;

  for (const line of lines.slice(1)) {
    const csvRow = parseCsvLine(line, headers);
    const normalized = normalizeOdaCsvRow(csvRow);
    if (!normalized) continue;

    trackCentroidsFromRow(normalized, postalCentroids, cityCentroids, streetRanges);
    const insertRow = prepareOdaInsertRow(normalized);

    addresses.push({
      id: id++,
      province: insertRow.province,
      civic_number: insertRow.civicNumber,
      street_name: insertRow.streetName,
      street_type: insertRow.streetType,
      street_direction: insertRow.streetDirection,
      unit: insertRow.unit,
      postal_code: insertRow.postalCode,
      city: insertRow.city,
      city_key: insertRow.cityKey,
      lat: insertRow.lat,
      lon: insertRow.lon,
      full_address: insertRow.fullAddress,
      search_key: insertRow.searchKey,
      street_key: insertRow.streetKey,
    });
  }

  const db: OdaMemoryDb = {
    addresses,
    postalCentroids: new Map(),
    cityCentroids: new Map(),
    streetRanges: new Map(),
  };

  for (const [postal, acc] of postalCentroids) {
    const province = addresses.find((a) => a.postal_code === postal)?.province ?? 'ON';
    db.postalCentroids.set(`${province}|${postal}`, {
      province,
      postal_code: postal,
      lat: acc.latSum / acc.count,
      lon: acc.lonSum / acc.count,
    });
  }

  for (const [cityKey, acc] of cityCentroids) {
    const province = cityKey.split('|')[1] ?? 'ON';
    db.cityCentroids.set(`${province}|${cityKey}`, {
      province,
      city_key: cityKey,
      city: acc.city,
      lat: acc.latSum / acc.count,
      lon: acc.lonSum / acc.count,
    });
  }

  for (const acc of streetRanges.values()) {
    // The accumulator already carries the real keys; re-splitting the map key collapsed
    // `TORONTO|ON|MAIN|ST` into `(TORONTO, ON)` and seeded unusable rows.
    const province = acc.cityKey.split('|')[1] ?? 'ON';
    db.streetRanges.set(`${province}|${acc.cityKey}|${acc.streetKey}`, {
      province,
      city_key: acc.cityKey,
      street_key: acc.streetKey,
      lat: acc.latSum / acc.count,
      lon: acc.lonSum / acc.count,
    });
  }

  return db;
}
