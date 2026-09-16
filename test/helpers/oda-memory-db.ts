import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeOdaCsvRow } from '../../src/oda-normalize';
import {
  prepareOdaInsertRow,
  trackCentroidsFromRow,
  type CentroidAccumulator,
} from '../../src/oda-import';
import type {
  AddressCandidate,
  AddressStore,
  AddressWithUnitTotal,
  CityCentroidRecord,
  PostalCentroidRecord,
  StreetRangeRecord,
} from '../../src/address-store';

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

// ---------------------------------------------------------------------------
// In-memory adapter
// ---------------------------------------------------------------------------

/**
 * SQLite `CAST(x AS INTEGER)` semantics: a non-numeric string casts to 0, not NaN.
 * Ordering and distance comparisons must match the D1 adapter's SQL exactly.
 */
function castInteger(value: string | null): number {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeUnit(value: string | null): string {
  return (value ?? '').replace(/\s/g, '').toUpperCase();
}

/**
 * Emulates `ORDER BY <city preference>, <street preference>`: the caller's own city spelling
 * (cityKeys[0]) outranks its aliases, and street-key preference breaks the tie. The sort is
 * stable, so equal-rank rows keep their insertion order, matching SQLite.
 */
function pickPreferred<T extends { city_key?: string; street_key?: string }>(
  rows: T[],
  cityKeys: string[],
  streetKeys: string[]
): T | null {
  if (rows.length === 0) return null;
  const cityRank = new Map(cityKeys.map((key, index) => [key, index]));
  const streetRank = new Map(streetKeys.map((key, index) => [key, index]));
  return [...rows].sort((a, b) => {
    const aCity = cityRank.get(a.city_key ?? '') ?? cityKeys.length;
    const bCity = cityRank.get(b.city_key ?? '') ?? cityKeys.length;
    if (aCity !== bCity) return aCity - bCity;
    const aRank = streetRank.get(a.street_key ?? '') ?? streetKeys.length;
    const bRank = streetRank.get(b.street_key ?? '') ?? streetKeys.length;
    return aRank - bRank;
  })[0];
}

function nearestByCivic<T extends { civic_number: string }>(rows: T[], civic: number): T {
  return rows.reduce((best, row) => {
    const bestDistance = Math.abs(castInteger(best.civic_number) - civic);
    const rowDistance = Math.abs(castInteger(row.civic_number) - civic);
    return rowDistance < bestDistance ? row : best;
  });
}

/**
 * The in-memory adapter. It answers the port's intent methods from fixture rows, so tests no
 * longer classify SQL text or reconstruct which bind parameter is which. Query order is not
 * observable: each method is a self-contained question.
 */
export interface InMemoryStoreOptions {
  /** Awaited at the start of every read; lets a test pause a query mid-flight. */
  beforeRead?: () => void | Promise<void>;
}

export function createInMemoryAddressStore(
  db: OdaMemoryDb,
  options: InMemoryStoreOptions = {}
): AddressStore {
  const store: AddressStore = {
    async findExactAddresses(input) {
      const wanted = new Set(input.searchKeys);
      return db.addresses
        .filter(
          (a) =>
            wanted.has(a.search_key) &&
            input.provinces.includes(a.province) &&
            (!input.unit || a.unit === input.unit)
        )
        .slice(0, input.limit) as AddressCandidate[];
    },

    async findAddressOnStreet(input) {
      const candidates = db.addresses.filter(
        (a) =>
          input.provinces.includes(a.province) &&
          input.cityKeys.includes(a.city_key) &&
          input.streetKeys.includes(a.street_key)
      );

      if (input.nearestToCivic === undefined) {
        const civics = candidates.filter(
          (a) =>
            a.civic_number === (input.civic ?? '') &&
            (!input.unit || a.unit === input.unit)
        );
        return pickPreferred(civics, input.cityKeys, input.streetKeys);
      }

      const best = pickPreferred(candidates, input.cityKeys, input.streetKeys);
      if (!best) return null;
      const sameStreet = candidates.filter((a) => a.street_key === best.street_key);
      return nearestByCivic(sameStreet, input.nearestToCivic);
    },

    async findStreetRange(input) {
      const hits: Array<StreetRangeRecord & { city_key: string }> = [];
      for (const cityKey of input.cityKeys) {
        for (const streetKey of input.streetKeys) {
          for (const prov of input.provinces) {
            const hit = db.streetRanges.get(`${prov}|${cityKey}|${streetKey}`);
            if (hit) {
              hits.push({
                lat: hit.lat,
                lon: hit.lon,
                province: hit.province,
                street_key: streetKey,
                city_key: cityKey,
              });
            }
          }
        }
      }
      return pickPreferred(hits, input.cityKeys, input.streetKeys);
    },

    async findPostalStreetAddresses(input) {
      return db.addresses.filter(
        (a) =>
          input.provinces.includes(a.province) &&
          a.postal_code === input.postal &&
          input.streetKeys.includes(a.street_key) &&
          a.civic_number === input.civic
      );
    },

    async findPostalCentroid(input) {
      for (const prov of input.provinces) {
        const hit = db.postalCentroids.get(`${prov}|${input.postal}`);
        if (hit) return hit as PostalCentroidRecord;
      }
      return null;
    },

    async findCityCentroid(input) {
      for (const cityKey of input.cityKeys) {
        const hit = db.cityCentroids.get(`${input.province}|${cityKey}`);
        if (hit) return hit as CityCentroidRecord;
      }
      return null;
    },

    async findCityCentroidsByPrefix(input) {
      const prefix = `${input.prefix}|`;
      return [...db.cityCentroids.values()].filter(
        (c) => input.provinces.includes(c.province) && c.city_key.startsWith(prefix)
      ) as CityCentroidRecord[];
    },

    async findAddressesInBounds(input) {
      const latMin = input.lat - input.delta;
      const latMax = input.lat + input.delta;
      const lonMin = input.lon - input.delta;
      const lonMax = input.lon + input.delta;
      return db.addresses
        .filter((a) => {
          if (a.lat < latMin || a.lat > latMax || a.lon < lonMin || a.lon > lonMax) return false;
          if (input.province && a.province !== input.province) return false;
          if (input.cityKey && a.city_key !== input.cityKey) return false;
          if (input.postal && a.postal_code !== input.postal) return false;
          return true;
        })
        .slice(0, input.limit);
    },

    async searchStreetSuggest() {
      // The fixture loads oda_addresses and the centroid/range tables, not the FTS suggest
      // index (built by a separate migration). No fixture-backed search test needs rows.
      return [];
    },

    async findAddressAtCivic(input) {
      const base = db.addresses.filter(
        (a) =>
          a.province === input.province &&
          a.city_key === input.cityKey &&
          a.street_key === input.streetKey &&
          a.civic_number === input.civic
      );
      const unitTotal = new Set(
        base.map((a) => a.unit).filter((u): u is string => Boolean(u))
      ).size;

      const matches = input.unit
        ? base.filter((a) => normalizeUnit(a.unit) === normalizeUnit(input.unit!))
        : base;
      if (matches.length === 0) return null;

      // ORDER BY unit-empty first, then numeric, then text.
      const [row] = [...matches].sort((a, b) => {
        const aEmpty = a.unit ? 0 : 1;
        const bEmpty = b.unit ? 0 : 1;
        if (aEmpty !== bEmpty) return aEmpty - bEmpty;
        const byNumber = castInteger(a.unit) - castInteger(b.unit);
        if (byNumber !== 0) return byNumber;
        return a.unit.localeCompare(b.unit);
      });
      return { ...row, unit_total: unitTotal } as AddressWithUnitTotal;
    },

    async listCivicsInStreet(input) {
      const filtered = db.addresses.filter((a) => {
        if (
          a.province !== input.province ||
          a.city_key !== input.cityKey ||
          a.street_key !== input.streetKey
        ) {
          return false;
        }
        if (input.civicPrefix !== undefined && !a.civic_number.startsWith(input.civicPrefix)) {
          return false;
        }
        if (input.cursor) {
          const value = [castInteger(a.civic_number), a.civic_number] as const;
          const after =
            value[0] > input.cursor.civicNum ||
            (value[0] === input.cursor.civicNum && value[1] > input.cursor.civicStr);
          if (!after) return false;
        }
        return true;
      });

      const groups = new Map<string, OdaMemoryAddressRow[]>();
      for (const row of filtered) {
        const group = groups.get(row.civic_number);
        if (group) group.push(row);
        else groups.set(row.civic_number, [row]);
      }

      const civics = [...groups.entries()]
        .map(([civicNumber, rows]) => {
          // min(unit): SQLite takes the other columns from the row holding the smallest
          // non-null unit. Empty string sorts before any non-empty unit.
          const units = rows.map((r) => r.unit).filter((u): u is string => u !== null && u !== undefined);
          const smallest = units.length ? [...units].sort((a, b) => a.localeCompare(b))[0] : '';
          const sample = rows.find((r) => r.unit === smallest) ?? rows[0];
          const unitTotal = new Set(rows.map((r) => r.unit).filter(Boolean)).size;
          return { ...sample, civic_number: civicNumber, unit: smallest, unit_total: unitTotal };
        })
        .sort((a, b) => {
          const byNumber = castInteger(a.civic_number) - castInteger(b.civic_number);
          if (byNumber !== 0) return byNumber;
          return a.civic_number.localeCompare(b.civic_number);
        });

      return civics.slice(0, input.limit + 1) as AddressWithUnitTotal[];
    },

    async listUnitsInBuilding(input) {
      const prefix = input.unitPrefix ? normalizeUnit(input.unitPrefix) : undefined;
      return db.addresses
        .filter((a) => {
          if (
            a.province !== input.province ||
            a.city_key !== input.cityKey ||
            a.street_key !== input.streetKey ||
            a.civic_number !== input.civic
          ) {
            return false;
          }
          if (prefix && !normalizeUnit(a.unit).startsWith(prefix)) return false;
          if (input.cursor && !(a.unit > input.cursor.unit)) return false;
          return true;
        })
        .sort((a, b) => {
          const byNumber = castInteger(a.unit) - castInteger(b.unit);
          if (byNumber !== 0) return byNumber;
          return a.unit.localeCompare(b.unit);
        })
        .slice(0, input.limit + 1);
    },
  };

  const beforeRead = options.beforeRead;
  if (!beforeRead) return store;

  const wrapped: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(store)) {
    wrapped[name] = async (...args: unknown[]) => {
      await beforeRead();
      return (fn as (...a: unknown[]) => unknown)(...args);
    };
  }
  return wrapped as unknown as AddressStore;
}

/**
 * Present the in-memory store as a D1Database so existing callers that pass `env.ODA_DB`
 * keep compiling. Any residual raw-SQL read fails loudly rather than being silently
 * re-implemented here; those paths are the follow-up slices' to migrate.
 */
function asD1Database(store: AddressStore): D1Database {
  const shim = store as unknown as Record<string, unknown>;
  shim.prepare = () => ({
    bind: () => ({
      first: async () => {
        throw new Error(
          'In-memory ODA fixture: raw SQL is not supported. Read through the AddressStore port.'
        );
      },
      all: async () => {
        throw new Error(
          'In-memory ODA fixture: raw SQL is not supported. Read through the AddressStore port.'
        );
      },
    }),
  });
  shim.batch = async () => [];
  return store as unknown as D1Database;
}

export function createOdaFixtureEnv(
  fixturePath?: string,
  options: InMemoryStoreOptions = {}
) {
  const db = loadOdaFixtureDb(fixturePath);
  const store = createInMemoryAddressStore(db, options);
  return {
    db,
    store,
    d1: asD1Database(store),
  };
}
