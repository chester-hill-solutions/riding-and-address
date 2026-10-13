/**
 * Address-store port.
 *
 * The ODA read path used to be SQL strings scattered across `oda-geocoding.ts` and
 * `oda-suggest.ts`, which forced the only test double (`test/helpers/oda-memory-db.ts`) to
 * classify statements by substring and re-implement filtering/ordering/ranking in JS. Query
 * order then leaked into positional mocks, so any new or reordered query forced a test edit.
 *
 * This port owns the ODA table names and the query shapes. Callers ask intent-level questions
 * ("which addresses carry these search keys", "what is the street range for this city/street");
 * the D1 adapter answers with SQL and an in-memory adapter answers from fixture rows. Adding or
 * changing a query touches one adapter, not every caller.
 *
 * Scope: this is the read path only. The import/DDL path still owns its own SQL.
 */

/** One `oda_addresses` row, minus internal-only columns. */
export interface AddressRecord {
  id: number;
  province: string;
  civic_number: string;
  street_name: string;
  street_type: string;
  street_direction: string;
  unit: string;
  postal_code: string;
  city: string;
  lat: number;
  lon: number;
  full_address: string;
}

/** Exact-match candidate: the row's `search_key` is needed for caller-side ordering. */
export interface AddressCandidate extends AddressRecord {
  search_key: string;
}

export interface AddressWithUnitTotal extends AddressRecord {
  unit_total: number;
}

export interface StreetRangeRecord {
  lat: number;
  lon: number;
  province: string;
  street_key?: string;
}

export interface PostalCentroidRecord {
  province: string;
  postal_code: string;
  lat: number;
  lon: number;
}

export interface CityCentroidRecord {
  province: string;
  city: string;
  lat: number;
  lon: number;
}

/** One `oda_street_suggest` row joined to its FTS rank. */
export interface StreetSuggestRecord {
  id: number;
  province: string;
  city: string;
  city_key: string;
  street_key: string;
  min_civic: number | null;
  max_civic: number | null;
  lat: number;
  lon: number;
  address_count: number;
  rank: number;
}

export interface FindExactAddressesInput {
  /** Caller-ordered, already capped and stripped of empties. */
  searchKeys: string[];
  provinces: string[];
  unit?: string;
  limit: number;
}

export interface FindAddressOnStreetInput {
  provinces: string[];
  /** Caller-ordered most-literal-first; also the ORDER BY preference. */
  cityKeys: string[];
  streetKeys: string[];
  /** Required unless `nearestToCivic` is set: exact civic match. */
  civic?: string;
  unit?: string;
  /**
   * When set, drop the civic equality filter and order the street's rows by
   * `ABS(civic - n)`: the nearest civic on the preferred street.
   */
  nearestToCivic?: number;
}

export interface FindStreetRangeInput {
  provinces: string[];
  cityKeys: string[];
  streetKeys: string[];
}

export interface FindPostalStreetAddressesInput {
  provinces: string[];
  postal: string;
  streetKeys: string[];
  civic: string;
}

export interface FindPostalCentroidInput {
  postal: string;
  provinces: string[];
}

export interface FindCityCentroidInput {
  province: string;
  /** Preference order: the caller's own spelling first. */
  cityKeys: string[];
}

export interface FindCityCentroidsByPrefixInput {
  provinces: string[];
  /** Normalized city token; the adapter matches `prefix|%`. */
  prefix: string;
  limit: number;
}

export interface FindAddressesInBoundsInput {
  lat: number;
  lon: number;
  delta: number;
  province?: string;
  cityKey?: string;
  postal?: string;
  limit: number;
}

export interface SearchStreetSuggestInput {
  /** FTS5 MATCH expression. */
  match: string;
  provinces: string[];
  restriction?: { minLat: number; minLon: number; maxLat: number; maxLon: number };
  locationBias?: { lat: number; lon: number };
  /** `suggest_text` prefix pattern (`${searchText}%`), the window's primary ordering. */
  prefixPattern: string;
  limit: number;
}

export interface FindAddressAtCivicInput {
  province: string;
  cityKey: string;
  streetKey: string;
  civic: string;
  unit?: string;
}

export interface ListCivicsInStreetInput {
  province: string;
  cityKey: string;
  streetKey: string;
  civicPrefix?: string;
  cursor?: { civicNum: number; civicStr: string };
  /** Page size; the adapter fetches `limit + 1` to detect a next page. */
  limit: number;
}

export interface ListUnitsInBuildingInput {
  province: string;
  cityKey: string;
  streetKey: string;
  civic: string;
  unitPrefix?: string;
  cursor?: { unit: string };
  /** Page size; the adapter fetches `limit + 1` to detect a next page. */
  limit: number;
}

/**
 * The ODA read surface. Every method is a question about the address data; none exposes a
 * statement, table name, or bind parameter.
 */
export interface AddressStore {
  /**
   * Exact civic+street matches for a set of `search_key`s, scoped to provinces and
   * optionally a normalized unit. Ordering is the caller's job (it knows which spelling
   * it prefers).
   */
  findExactAddresses(input: FindExactAddressesInput): Promise<AddressCandidate[]>;

  /** The preferred city/street row at a civic, or the nearest civic when asked. */
  findAddressOnStreet(input: FindAddressOnStreetInput): Promise<AddressRecord | null>;

  /** Street-level centroid for a preferred city/street pair. */
  findStreetRange(input: FindStreetRangeInput): Promise<StreetRangeRecord | null>;

  /** Civic+street matches within a postal code, for address-less-city queries. */
  findPostalStreetAddresses(
    input: FindPostalStreetAddressesInput
  ): Promise<AddressRecord[]>;

  /** Postal-code centroid within the given provinces. */
  findPostalCentroid(input: FindPostalCentroidInput): Promise<PostalCentroidRecord | null>;

  /** City centroid for the first preferred city key that exists. */
  findCityCentroid(input: FindCityCentroidInput): Promise<CityCentroidRecord | null>;

  /** City centroids whose key starts with the normalized city token. */
  findCityCentroidsByPrefix(
    input: FindCityCentroidsByPrefixInput
  ): Promise<CityCentroidRecord[]>;

  /** Addresses within a lat/lon box, with optional province/city/postal narrowing. */
  findAddressesInBounds(input: FindAddressesInBoundsInput): Promise<AddressRecord[]>;

  /** FTS-backed street containers for autocomplete: the candidate window. */
  searchStreetSuggest(input: SearchStreetSuggestInput): Promise<StreetSuggestRecord[]>;

  /** The preferred row at a civic plus how many distinct units share the building. */
  findAddressAtCivic(
    input: FindAddressAtCivicInput
  ): Promise<AddressWithUnitTotal | null>;

  /** Street container drill-down: civics on a street, keyset-paged. */
  listCivicsInStreet(input: ListCivicsInStreetInput): Promise<AddressWithUnitTotal[]>;

  /** Building container drill-down: units in a building, keyset-paged. */
  listUnitsInBuilding(input: ListUnitsInBuildingInput): Promise<AddressRecord[]>;
}

/** True when a value already implements the port (an in-memory adapter, typically). */
export function isAddressStore(value: unknown): value is AddressStore {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AddressStore).findExactAddresses === 'function' &&
    typeof (value as AddressStore).searchStreetSuggest === 'function'
  );
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

function newAddressStore(db: D1Database): AddressStore {
  return {
    async findExactAddresses(input) {
      const unitFilter = input.unit ? 'AND unit = ?' : '';
      const unitParams = input.unit ? [input.unit] : [];
      const result = await db
        .prepare(
          `
    SELECT id, province, civic_number, street_name, street_type, street_direction,
           unit, postal_code, city, lat, lon, full_address, search_key
    FROM oda_addresses
    WHERE search_key IN (${placeholders(input.searchKeys.length)}) AND province IN (${placeholders(input.provinces.length)}) ${unitFilter}
    LIMIT ${input.limit}
  `
        )
        .bind(...input.searchKeys, ...input.provinces, ...unitParams)
        .all<AddressCandidate>();
      return result.results || [];
    },

    async findAddressOnStreet(input) {
      const cityOrder = `CASE city_key ${input.cityKeys
        .map((_, i) => `WHEN ? THEN ${i}`)
        .join(' ')} ELSE ${input.cityKeys.length} END`;
      const streetOrder = `CASE street_key ${input.streetKeys
        .map((_, i) => `WHEN ? THEN ${i}`)
        .join(' ')} ELSE ${input.streetKeys.length} END`;
      const nearMode = input.nearestToCivic !== undefined;
      const orderBy = nearMode
        ? `${cityOrder}, ${streetOrder}, ABS(CAST(civic_number AS INTEGER) - ?) ASC`
        : `${cityOrder}, ${streetOrder}`;
      const orderParams = nearMode
        ? [...input.cityKeys, ...input.streetKeys, input.nearestToCivic]
        : [...input.cityKeys, ...input.streetKeys];
      const civicFilter = nearMode ? '' : 'AND civic_number = ?';
      const civicParams = nearMode ? [] : [input.civic ?? ''];
      const unitFilter = !nearMode && input.unit ? 'AND unit = ?' : '';
      const unitParams = !nearMode && input.unit ? [input.unit] : [];

      return db
        .prepare(
          `
        SELECT id, province, civic_number, street_name, street_type, street_direction,
               unit, postal_code, city, lat, lon, full_address
        FROM oda_addresses
        WHERE province IN (${placeholders(input.provinces.length)}) AND city_key IN (${placeholders(input.cityKeys.length)})
          AND street_key IN (${placeholders(input.streetKeys.length)}) ${civicFilter} ${unitFilter}
        ORDER BY ${orderBy}
        LIMIT 1
      `
        )
        .bind(
          ...input.provinces,
          ...input.cityKeys,
          ...input.streetKeys,
          ...civicParams,
          ...unitParams,
          ...orderParams
        )
        .first<AddressRecord>();
    },

    async findStreetRange(input) {
      const cityOrder = `CASE city_key ${input.cityKeys
        .map((_, i) => `WHEN ? THEN ${i}`)
        .join(' ')} ELSE ${input.cityKeys.length} END`;
      const streetOrder = `CASE street_key ${input.streetKeys
        .map((_, i) => `WHEN ? THEN ${i}`)
        .join(' ')} ELSE ${input.streetKeys.length} END`;
      const orderBy = `${cityOrder}, ${streetOrder}`;
      const orderParams = [...input.cityKeys, ...input.streetKeys];

      return db
        .prepare(
          `
    SELECT lat, lon, province, street_key FROM oda_street_ranges
    WHERE province IN (${placeholders(input.provinces.length)}) AND city_key IN (${placeholders(input.cityKeys.length)})
      AND street_key IN (${placeholders(input.streetKeys.length)})
    ORDER BY ${orderBy}
    LIMIT 1
  `
        )
        .bind(
          ...input.provinces,
          ...input.cityKeys,
          ...input.streetKeys,
          ...orderParams
        )
        .first<StreetRangeRecord>();
    },

    async findPostalStreetAddresses(input) {
      const result = await db
        .prepare(
          `
    SELECT id, province, civic_number, street_name, street_type, street_direction,
           unit, postal_code, city, lat, lon, full_address
    FROM oda_addresses
    WHERE province IN (${placeholders(input.provinces.length)})
      AND postal_code = ?
      AND street_key IN (${placeholders(input.streetKeys.length)})
      AND civic_number = ?
    LIMIT 20
  `
        )
        .bind(...input.provinces, input.postal, ...input.streetKeys, input.civic)
        .all<AddressRecord>();
      return result.results || [];
    },

    async findPostalCentroid(input) {
      return db
        .prepare(
          `
    SELECT province, postal_code, lat, lon
    FROM oda_postal_centroids
    WHERE postal_code = ? AND province IN (${placeholders(input.provinces.length)})
    LIMIT 1
  `
        )
        .bind(input.postal, ...input.provinces)
        .first<PostalCentroidRecord>();
    },

    async findCityCentroid(input) {
      const cityOrder = `CASE city_key ${input.cityKeys
        .map((_, i) => `WHEN ? THEN ${i}`)
        .join(' ')} ELSE ${input.cityKeys.length} END`;
      return db
        .prepare(
          `
      SELECT province, city, lat, lon FROM oda_city_centroids
      WHERE province = ? AND city_key IN (${placeholders(input.cityKeys.length)})
      ORDER BY ${cityOrder}
      LIMIT 1
    `
        )
        .bind(input.province, ...input.cityKeys, ...input.cityKeys)
        .first<CityCentroidRecord>();
    },

    async findCityCentroidsByPrefix(input) {
      const result = await db
        .prepare(
          `
    SELECT province, city, lat, lon FROM oda_city_centroids
    WHERE province IN (${placeholders(input.provinces.length)}) AND city_key LIKE ?
    LIMIT ${input.limit}
  `
        )
        .bind(...input.provinces, `${input.prefix}|%`)
        .all<CityCentroidRecord>();
      return result.results || [];
    },

    async findAddressesInBounds(input) {
      let sql = `
      SELECT a.id, a.province, a.civic_number, a.street_name, a.street_type, a.street_direction,
             a.unit, a.postal_code, a.city, a.lat, a.lon, a.full_address
      FROM oda_addresses a
      WHERE a.lat BETWEEN ? AND ?
        AND a.lon BETWEEN ? AND ?
    `;
      const params: unknown[] = [
        input.lat - input.delta,
        input.lat + input.delta,
        input.lon - input.delta,
        input.lon + input.delta,
      ];
      if (input.province) {
        sql += ` AND a.province = ?`;
        params.push(input.province);
      }
      if (input.cityKey) {
        sql += ` AND a.city_key = ?`;
        params.push(input.cityKey);
      }
      if (input.postal) {
        sql += ` AND a.postal_code = ?`;
        params.push(input.postal);
      }
      sql += ` LIMIT ?`;
      params.push(input.limit);

      const result = await db.prepare(sql).bind(...params).all<AddressRecord>();
      return result.results || [];
    },

    async searchStreetSuggest(input) {
      const where: string[] = ['oda_suggest_fts MATCH ?'];
      const binds: unknown[] = [input.match];

      if (input.provinces.length) {
        where.push(`s.province IN (${placeholders(input.provinces.length)})`);
        binds.push(...input.provinces);
      }

      if (input.restriction) {
        where.push('s.lat BETWEEN ? AND ?', 's.lon BETWEEN ? AND ?');
        binds.push(
          input.restriction.minLat,
          input.restriction.maxLat,
          input.restriction.minLon,
          input.restriction.maxLon
        );
      }

      const orderBy: string[] = [];
      orderBy.push('CASE WHEN s.suggest_text LIKE ? THEN 0 ELSE 1 END ASC');
      binds.push(input.prefixPattern);

      if (input.locationBias) {
        orderBy.push('((s.lat - ?) * (s.lat - ?) + (s.lon - ?) * (s.lon - ?) * 0.53) ASC');
        binds.push(
          input.locationBias.lat,
          input.locationBias.lat,
          input.locationBias.lon,
          input.locationBias.lon
        );
      }

      orderBy.push('s.address_count DESC', 'rank ASC');
      binds.push(input.limit);

      const result = await db
        .prepare(
          `SELECT s.id, s.province, s.city, s.city_key, s.street_key,
                      s.min_civic, s.max_civic, s.lat, s.lon, s.address_count,
                      bm25(oda_suggest_fts) AS rank
               FROM oda_suggest_fts f
               JOIN oda_street_suggest s ON s.id = f.rowid
               WHERE ${where.join(' AND ')}
               ORDER BY ${orderBy.join(', ')}
               LIMIT ?`
        )
        .bind(...binds)
        .all<StreetSuggestRecord>();
      return result.results || [];
    },

    async findAddressAtCivic(input) {
      const where = [
        'a.province = ?',
        'a.city_key = ?',
        'a.street_key = ?',
        'a.civic_number = ?',
      ];
      const binds: unknown[] = [input.province, input.cityKey, input.streetKey, input.civic];

      if (input.unit) {
        where.push("UPPER(REPLACE(a.unit, ' ', '')) = ?");
        binds.push(input.unit.replace(/\s/g, ''));
      }

      return db
        .prepare(
          `SELECT a.civic_number, a.unit, a.postal_code, a.street_name, a.street_type,
                      a.street_direction, a.city, a.province, a.lat, a.lon, a.full_address,
                      (SELECT COUNT(DISTINCT NULLIF(u.unit, ''))
                         FROM oda_addresses u
                        WHERE u.province = a.province AND u.city_key = a.city_key
                          AND u.street_key = a.street_key AND u.civic_number = a.civic_number
                      ) AS unit_total
               FROM oda_addresses a
               WHERE ${where.join(' AND ')}
               ORDER BY CASE WHEN a.unit = '' OR a.unit IS NULL THEN 0 ELSE 1 END,
                        CAST(a.unit AS INTEGER), a.unit
               LIMIT 1`
        )
        .bind(...binds)
        .first<AddressWithUnitTotal>();
    },

    async listCivicsInStreet(input) {
      const where = ['province = ?', 'city_key = ?', 'street_key = ?'];
      const binds: unknown[] = [input.province, input.cityKey, input.streetKey];

      if (input.civicPrefix !== undefined) {
        where.push('civic_number LIKE ?');
        binds.push(`${input.civicPrefix}%`);
      }
      if (input.cursor) {
        where.push('(CAST(civic_number AS INTEGER), civic_number) > (?, ?)');
        binds.push(input.cursor.civicNum, input.cursor.civicStr);
      }
      binds.push(input.limit + 1);

      const result = await db
        .prepare(
          `SELECT civic_number, min(unit) AS unit, postal_code, street_name, street_type,
                      street_direction, city, province, lat, lon, full_address,
                      COUNT(DISTINCT NULLIF(unit, '')) AS unit_total
               FROM oda_addresses
               WHERE ${where.join(' AND ')}
               GROUP BY civic_number
               ORDER BY CAST(civic_number AS INTEGER), civic_number
               LIMIT ?`
        )
        .bind(...binds)
        .all<AddressWithUnitTotal>();
      return result.results || [];
    },

    async listUnitsInBuilding(input) {
      const where = ['province = ?', 'city_key = ?', 'street_key = ?', 'civic_number = ?'];
      const binds: unknown[] = [
        input.province,
        input.cityKey,
        input.streetKey,
        input.civic,
      ];

      if (input.unitPrefix) {
        where.push("UPPER(REPLACE(unit, ' ', '')) LIKE ?");
        binds.push(`${input.unitPrefix.replace(/\s/g, '')}%`);
      }
      if (input.cursor) {
        where.push('unit > ?');
        binds.push(input.cursor.unit);
      }
      binds.push(input.limit + 1);

      const result = await db
        .prepare(
          `SELECT civic_number, unit, postal_code, street_name, street_type, street_direction,
                      city, province, lat, lon, full_address
               FROM oda_addresses
               WHERE ${where.join(' AND ')}
               ORDER BY CAST(unit AS INTEGER), unit
               LIMIT ?`
        )
        .bind(...binds)
        .all<AddressRecord>();
      return result.results || [];
    },
  };
}

/** Build the production adapter: owns every ODA table name and query shape on this path. */
export function createD1AddressStore(db: D1Database): AddressStore {
  return newAddressStore(db);
}

/**
 * Resolve the port for a D1 binding, or pass through an in-memory adapter unchanged, and wrap
 * whichever it is so every read is reported exactly once. Recording lives here rather than in
 * either adapter so the two stay symmetric and a new method cannot forget to count.
 */
export function getAddressStore(db: D1Database, record: () => void): AddressStore {
  const store: AddressStore = isAddressStore(db) ? db : newAddressStore(db);
  const call = <T>(operation: () => Promise<T>): Promise<T> => {
    record();
    return operation();
  };
  return {
    findExactAddresses: (input) => call(() => store.findExactAddresses(input)),
    findAddressOnStreet: (input) => call(() => store.findAddressOnStreet(input)),
    findStreetRange: (input) => call(() => store.findStreetRange(input)),
    findPostalStreetAddresses: (input) => call(() => store.findPostalStreetAddresses(input)),
    findPostalCentroid: (input) => call(() => store.findPostalCentroid(input)),
    findCityCentroid: (input) => call(() => store.findCityCentroid(input)),
    findCityCentroidsByPrefix: (input) => call(() => store.findCityCentroidsByPrefix(input)),
    findAddressesInBounds: (input) => call(() => store.findAddressesInBounds(input)),
    searchStreetSuggest: (input) => call(() => store.searchStreetSuggest(input)),
    findAddressAtCivic: (input) => call(() => store.findAddressAtCivic(input)),
    listCivicsInStreet: (input) => call(() => store.listCivicsInStreet(input)),
    listUnitsInBuilding: (input) => call(() => store.listUnitsInBuilding(input)),
  };
}
