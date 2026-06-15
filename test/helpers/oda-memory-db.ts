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

  for (const [rangeKey, acc] of streetRanges) {
    const [cityKey, streetKey] = rangeKey.split('|');
    const province = cityKey.split('|')[1] ?? 'ON';
    db.streetRanges.set(`${province}|${cityKey}|${streetKey}`, {
      province,
      city_key: cityKey,
      street_key: streetKey,
      lat: acc.latSum / acc.count,
      lon: acc.lonSum / acc.count,
    });
  }

  return db;
}

function sqlKind(sql: string): string {
  const s = sql.replace(/\s+/g, ' ').toUpperCase();
  if (s.includes('SEARCH_KEY =') && s.includes('ODA_ADDRESSES')) return 'exact';
  if (s.includes('ODA_POSTAL_CENTROIDS')) return 'postal';
  if (s.includes('CIVIC_NUMBER =')) return 'street_exact';
  if (s.includes('ORDER BY ABS(CAST(CIVIC_NUMBER')) return 'street_nearest';
  if (s.includes('ODA_STREET_RANGES')) return 'street_range';
  if (s.includes('ODA_CITY_CENTROIDS') && s.includes('CITY_KEY LIKE')) return 'city_fuzzy';
  if (s.includes('ODA_CITY_CENTROIDS')) return 'city';
  if (s.includes('BETWEEN') && s.includes('ODA_ADDRESSES')) return 'bbox';
  return 'unknown';
}

function executeQuery(db: OdaMemoryDb, sql: string, params: unknown[]): unknown {
  const kind = sqlKind(sql);

  switch (kind) {
    case 'exact': {
      const searchKey = String(params[0]);
      const provinces = params.slice(1).map(String);
      return db.addresses.find((a) => a.search_key === searchKey && provinces.includes(a.province)) ?? null;
    }
    case 'postal': {
      const postal = String(params[0]);
      const provinces = params.slice(1).map(String);
      for (const prov of provinces) {
        const hit = db.postalCentroids.get(`${prov}|${postal}`);
        if (hit) return hit;
      }
      return null;
    }
    case 'street_exact': {
      const provinces = params.slice(0, -3).map(String);
      const cityKey = String(params[params.length - 3]);
      const streetKey = String(params[params.length - 2]);
      const civic = String(params[params.length - 1]);
      return (
        db.addresses.find(
          (a) =>
            provinces.includes(a.province) &&
            a.city_key === cityKey &&
            a.street_key === streetKey &&
            a.civic_number === civic
        ) ?? null
      );
    }
    case 'street_nearest': {
      const provinces = params.slice(0, -3).map(String);
      const cityKey = String(params[params.length - 3]);
      const streetKey = String(params[params.length - 2]);
      const civicNumeric = Number(params[params.length - 1]);
      const candidates = db.addresses.filter(
        (a) =>
          provinces.includes(a.province) &&
          a.city_key === cityKey &&
          a.street_key === streetKey
      );
      if (candidates.length === 0) return null;
      return candidates.reduce((best, row) => {
        const bestNum = parseInt(best.civic_number, 10);
        const rowNum = parseInt(row.civic_number, 10);
        const bestDist = Math.abs(bestNum - civicNumeric);
        const rowDist = Math.abs(rowNum - civicNumeric);
        return rowDist < bestDist ? row : best;
      });
    }
    case 'street_range': {
      const provinces = params.slice(0, -2).map(String);
      const cityKey = String(params[params.length - 2]);
      const streetKey = String(params[params.length - 1]);
      for (const prov of provinces) {
        const hit = db.streetRanges.get(`${prov}|${cityKey}|${streetKey}`);
        if (hit) return hit;
      }
      return null;
    }
    case 'city': {
      const province = String(params[0]);
      const cityKey = String(params[1]);
      return db.cityCentroids.get(`${province}|${cityKey}`) ?? null;
    }
    case 'city_fuzzy': {
      const provinces = params.slice(0, -1).map(String);
      const likePattern = String(params[params.length - 1]).replace(/%/g, '');
      const matches = [...db.cityCentroids.values()].filter(
        (c) => provinces.includes(c.province) && c.city_key.startsWith(likePattern)
      );
      return matches;
    }
    case 'bbox': {
      let i = 0;
      const latMin = Number(params[i++]);
      const latMax = Number(params[i++]);
      const lonMin = Number(params[i++]);
      const lonMax = Number(params[i++]);
      let provinceFilter: string | undefined;
      let cityKeyFilter: string | undefined;
      let postalFilter: string | undefined;

      if (sql.toUpperCase().includes('A.PROVINCE = ?')) {
        provinceFilter = String(params[i++]);
      }
      if (sql.toUpperCase().includes('A.CITY_KEY = ?')) {
        cityKeyFilter = String(params[i++]);
      }
      if (sql.toUpperCase().includes('A.POSTAL_CODE = ?')) {
        postalFilter = String(params[i++]);
      }
      const limit = Number(params[i]);

      const filtered = db.addresses.filter((a) => {
        if (a.lat < latMin || a.lat > latMax || a.lon < lonMin || a.lon > lonMax) return false;
        if (provinceFilter && a.province !== provinceFilter) return false;
        if (cityKeyFilter && a.city_key !== cityKeyFilter) return false;
        if (postalFilter && a.postal_code !== postalFilter) return false;
        return true;
      });
      return filtered.slice(0, limit);
    }
    default:
      return null;
  }
}

export function createOdaMemoryD1(db: OdaMemoryDb): D1Database {
  return {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => {
        const kind = sqlKind(sql);
        const _isAll = kind === 'bbox' || kind === 'city_fuzzy';
        return {
          first: async () => {
            const result = executeQuery(db, sql, params);
            if (Array.isArray(result)) return result[0] ?? null;
            return result;
          },
          all: async () => {
            const result = executeQuery(db, sql, params);
            const results = Array.isArray(result) ? result : result ? [result] : [];
            return { results };
          },
        };
      },
    }),
    batch: async () => [],
  } as unknown as D1Database;
}

export function createOdaFixtureEnv(fixturePath?: string) {
  const db = loadOdaFixtureDb(fixturePath);
  return {
    db,
    d1: createOdaMemoryD1(db),
  };
}
