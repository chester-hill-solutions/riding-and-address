import {
  Env,
  QueryParams,
  OdaAddressComponents,
  OdaDataSource,
  OdaGeocodeMethod,
  OdaGeocodeMetadata,
} from './types';
import {
  CONFIDENCE_BY_METHOD,
  getOdaConfig,
  isOdaEnabled,
} from './oda-config';
import { isPostalOnlyQuery } from './geocode-query';
import {
  buildCityKey,
  buildSearchKey,
  buildStreetKey,
  normalizePostalCode,
  normalizeSearchToken,
  parseAddressQuery,
} from './oda-normalize';
import { formatFromOdaRow } from './canada-post-format';

export class OdaGeocodeError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'OdaGeocodeError';
    this.code = code;
    this.status = status;
  }
}

export type OdaGeocodeResult = {
  lon: number;
  lat: number;
  normalizedAddress?: string;
  addressComponents?: OdaAddressComponents;
} & OdaGeocodeMetadata;

interface OdaAddressRow {
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

function haversineMeters(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function rowToComponents(row: OdaAddressRow): OdaAddressComponents {
  return {
    civic_number: row.civic_number || undefined,
    street_name: row.street_name || undefined,
    street_type: row.street_type || undefined,
    street_direction: row.street_direction || undefined,
    unit: row.unit || undefined,
    locality: row.city || undefined,
    administrative_area_level_1: row.province || undefined,
    postal_code: row.postal_code || undefined,
    country: 'Canada',
  };
}

function buildResult(
  row: Partial<OdaAddressRow> & { lat: number; lon: number; province: string },
  method: OdaGeocodeMethod,
  config: ReturnType<typeof getOdaConfig>,
  matchedFields: string[],
  distanceMeters?: number,
  confidenceOverride?: number
): OdaGeocodeResult {
  const mailingAddress = formatFromOdaRow({
    civic_number: row.civic_number,
    street_name: row.street_name,
    street_type: row.street_type,
    street_direction: row.street_direction,
    unit: row.unit,
    city: row.city,
    province: row.province,
    postal_code: row.postal_code,
  });

  const confidence =
    confidenceOverride ??
    (method === 'nearest_neighbor' && distanceMeters !== undefined
      ? Math.min(CONFIDENCE_BY_METHOD.nearest_neighbor, Math.max(0.3, 1 - distanceMeters / 10000))
      : CONFIDENCE_BY_METHOD[method]);

  const dataSource: OdaDataSource = {
    provider: 'statcan-oda',
    version: config.dataVersion,
    province: row.province,
    canadaPostCertified: false,
  };

  const components = rowToComponents(row as OdaAddressRow);

  return {
    lon: row.lon,
    lat: row.lat,
    normalizedAddress: mailingAddress.formattedSingleLine,
    mailingAddress,
    addressComponents: components,
    geocodeMethod: method,
    confidence,
    distanceMeters,
    matchedFields,
    dataSource,
  };
}

function assertConfidence(result: OdaGeocodeResult, minConfidence: number): OdaGeocodeResult {
  if ((result.confidence ?? 0) < minConfidence) {
    throw new OdaGeocodeError(
      'Geocode confidence below minimum threshold',
      'LOW_CONFIDENCE_GEOCODE',
      422
    );
  }
  return result;
}

function resolveProvinces(parsed: ReturnType<typeof parseAddressQuery>, loadedProvinces: string[]): string[] {
  if (parsed.province) {
    if (!loadedProvinces.includes(parsed.province)) {
      throw new OdaGeocodeError(
        `Province ${parsed.province} is not loaded in ODA database`,
        'PROVINCE_NOT_LOADED',
        404
      );
    }
    return [parsed.province];
  }
  return loadedProvinces;
}

function isStreetOnlyAmbiguous(parsed: ReturnType<typeof parseAddressQuery>): boolean {
  const hasStreet = !!(parsed.streetName || parsed.civic);
  const hasContext = !!(parsed.city || parsed.province || parsed.postal);
  return hasStreet && !hasContext;
}

async function findExactMatch(
  env: Env,
  searchKey: string,
  provinces: string[]
): Promise<OdaAddressRow | null> {
  if (!env.ODA_DB || !searchKey.replace(/\|/g, '').trim()) return null;

  const placeholders = provinces.map(() => '?').join(',');
  const result = await env.ODA_DB.prepare(`
    SELECT id, province, civic_number, street_name, street_type, street_direction,
           unit, postal_code, city, lat, lon, full_address
    FROM oda_addresses
    WHERE search_key = ? AND province IN (${placeholders})
    LIMIT 1
  `)
    .bind(searchKey, ...provinces)
    .first();

  return (result as OdaAddressRow | null) ?? null;
}

async function findPostalCentroid(
  env: Env,
  postal: string,
  provinces: string[]
): Promise<{ lat: number; lon: number; province: string; postal_code: string } | null> {
  if (!env.ODA_DB) return null;
  const placeholders = provinces.map(() => '?').join(',');

  const result = await env.ODA_DB.prepare(`
    SELECT province, postal_code, lat, lon
    FROM oda_postal_centroids
    WHERE postal_code = ? AND province IN (${placeholders})
    LIMIT 1
  `)
    .bind(postal, ...provinces)
    .first();

  return result as { lat: number; lon: number; province: string; postal_code: string } | null;
}

async function findStreetInterpolated(
  env: Env,
  parsed: ReturnType<typeof parseAddressQuery>,
  provinces: string[]
): Promise<OdaAddressRow | null> {
  if (!env.ODA_DB || !parsed.city || !parsed.streetName) return null;

  const streetTypes = parsed.streetType
    ? [parsed.streetType]
    : ['', 'AVE', 'ST', 'RD', 'DR', 'BLVD', 'CRES'];

  for (const streetType of streetTypes) {
    const cityKey = buildCityKey(parsed.city, parsed.province || provinces[0]);
    const streetKey = buildStreetKey(
      parsed.streetName,
      streetType,
      parsed.streetDirection || ''
    );
    const placeholders = provinces.map(() => '?').join(',');

    if (parsed.civicParsed?.numeric !== null && parsed.civicParsed?.numeric !== undefined) {
      const civic = parsed.civicParsed.raw;
      const exact = await env.ODA_DB.prepare(`
      SELECT id, province, civic_number, street_name, street_type, street_direction,
             unit, postal_code, city, lat, lon, full_address
      FROM oda_addresses
      WHERE province IN (${placeholders}) AND city_key = ? AND street_key = ? AND civic_number = ?
      LIMIT 1
    `)
        .bind(...provinces, cityKey, streetKey, civic)
        .first();
      if (exact) return exact as unknown as OdaAddressRow;

      const nearest = await env.ODA_DB.prepare(`
      SELECT id, province, civic_number, street_name, street_type, street_direction,
             unit, postal_code, city, lat, lon, full_address
      FROM oda_addresses
      WHERE province IN (${placeholders}) AND city_key = ? AND street_key = ?
      ORDER BY ABS(CAST(civic_number AS INTEGER) - ?) ASC
      LIMIT 1
    `)
        .bind(...provinces, cityKey, streetKey, parsed.civicParsed.numeric)
        .first();
      if (nearest) return nearest as unknown as OdaAddressRow;
    }

    const range = await env.ODA_DB.prepare(`
    SELECT lat, lon, province FROM oda_street_ranges
    WHERE province IN (${placeholders}) AND city_key = ? AND street_key = ?
    LIMIT 1
  `)
      .bind(...provinces, cityKey, streetKey)
      .first();

    if (range) {
      return {
        id: 0,
        province: range.province as string,
        civic_number: parsed.civic || '',
        street_name: parsed.streetName,
        street_type: streetType || parsed.streetType || '',
        street_direction: parsed.streetDirection || '',
        unit: '',
        postal_code: parsed.postal || '',
        city: parsed.city,
        lat: range.lat as number,
        lon: range.lon as number,
        full_address: '',
      };
    }
  }

  return null;
}

async function findCityCentroid(
  env: Env,
  parsed: ReturnType<typeof parseAddressQuery>,
  provinces: string[]
): Promise<{ lat: number; lon: number; province: string; city: string } | null> {
  if (!env.ODA_DB || !parsed.city) return null;
  const placeholders = provinces.map(() => '?').join(',');

  for (const prov of parsed.province ? [parsed.province] : provinces) {
    const cityKey = buildCityKey(parsed.city, prov);
    const result = await env.ODA_DB.prepare(`
      SELECT province, city, lat, lon FROM oda_city_centroids
      WHERE province = ? AND city_key = ?
      LIMIT 1
    `)
      .bind(prov, cityKey)
      .first();
    if (result) return result as { lat: number; lon: number; province: string; city: string };
  }

  const result = await env.ODA_DB.prepare(`
    SELECT province, city, lat, lon FROM oda_city_centroids
    WHERE province IN (${placeholders}) AND city_key LIKE ?
    LIMIT ${provinces.length}
  `)
    .bind(...provinces, `${normalizeSearchToken(parsed.city)}|%`)
    .all();

  const matches = result.results || [];
  if (matches.length > 1) {
    throw new OdaGeocodeError(
      'Multiple city matches found; provide province to disambiguate',
      'AMBIGUOUS_LOCATION',
      422
    );
  }
  if (matches.length === 1) {
    return matches[0] as { lat: number; lon: number; province: string; city: string };
  }
  return null;
}

async function findNearestNeighbor(
  env: Env,
  lon: number,
  lat: number,
  config: ReturnType<typeof getOdaConfig>,
  bounds?: { province?: string; cityKey?: string; postal?: string }
): Promise<{ row: OdaAddressRow; distance: number } | null> {
  if (!env.ODA_DB) return null;

  const bboxSteps = [0.0025, 0.01, 0.05, 0.25];
  let candidates: OdaAddressRow[] = [];

  for (const delta of bboxSteps) {
    let query = `
      SELECT a.id, a.province, a.civic_number, a.street_name, a.street_type, a.street_direction,
             a.unit, a.postal_code, a.city, a.lat, a.lon, a.full_address
      FROM oda_addresses a
      WHERE a.lat BETWEEN ? AND ?
        AND a.lon BETWEEN ? AND ?
    `;
    const params: unknown[] = [lat - delta, lat + delta, lon - delta, lon + delta];

    if (bounds?.province) {
      query += ` AND a.province = ?`;
      params.push(bounds.province);
    }
    if (bounds?.cityKey) {
      query += ` AND a.city_key = ?`;
      params.push(bounds.cityKey);
    }
    if (bounds?.postal) {
      query += ` AND a.postal_code = ?`;
      params.push(bounds.postal);
    }

    query += ` LIMIT ?`;
    params.push(config.nnMaxCandidates);

    const results = await env.ODA_DB.prepare(query).bind(...params).all();
    candidates = (results.results || []) as unknown as OdaAddressRow[];
    if (candidates.length >= 1) break;
  }

  if (candidates.length === 0) return null;

  let best: { row: OdaAddressRow; distance: number } | null = null;
  for (const row of candidates) {
    const distance = haversineMeters(lon, lat, row.lon, row.lat);
    if (!best || distance < best.distance) {
      best = { row, distance };
    }
  }
  return best;
}

export async function geocodeWithOda(env: Env, qp: QueryParams): Promise<OdaGeocodeResult> {
  const config = getOdaConfig(env);
  if (!env.ODA_DB) {
    throw new OdaGeocodeError('ODA database not configured', 'ODA_NOT_CONFIGURED', 503);
  }

  const parsed = parseAddressQuery({
    address: qp.address,
    postal: qp.postal,
    city: qp.city,
    state: qp.state,
  });

  if (isStreetOnlyAmbiguous(parsed)) {
    throw new OdaGeocodeError(
      'Street-only queries require city, province, or postal code',
      'AMBIGUOUS_LOCATION',
      422
    );
  }

  const provinces = resolveProvinces(parsed, config.provinces);

  const searchKey = buildSearchKey({
    civic: parsed.civic,
    streetName: parsed.streetName,
    streetType: parsed.streetType,
    streetDirection: parsed.streetDirection,
    city: parsed.city,
    province: parsed.province || provinces[0],
  });

  const exact = await findExactMatch(env, searchKey, provinces);
  if (exact) {
    return assertConfidence(
      buildResult(exact, 'exact', config, ['civic', 'street', 'city', 'province']),
      config.minConfidence
    );
  }

  if (parsed.postal) {
    const postal = normalizePostalCode(parsed.postal);
    if (postal) {
      const centroid = await findPostalCentroid(env, postal, provinces);
      if (centroid) {
        return assertConfidence(
          buildResult(
            {
              lat: centroid.lat,
              lon: centroid.lon,
              province: centroid.province,
              postal_code: centroid.postal_code,
              city: parsed.city || '',
              civic_number: '',
              street_name: '',
              street_type: '',
              street_direction: '',
              unit: '',
            },
            'postal_centroid',
            config,
            ['postal']
          ),
          config.minConfidence
        );
      }
    }
  }

  if (parsed.streetName && parsed.city) {
    const street = await findStreetInterpolated(env, parsed, provinces);
    if (street) {
      return assertConfidence(
        buildResult(street, 'street_interpolated', config, ['street', 'city']),
        config.minConfidence
      );
    }
  }

  if (parsed.city) {
    const cityCentroid = await findCityCentroid(env, parsed, provinces);
    if (cityCentroid) {
      const result = buildResult(
        {
          lat: cityCentroid.lat,
          lon: cityCentroid.lon,
          province: cityCentroid.province,
          city: cityCentroid.city,
          civic_number: '',
          street_name: '',
          street_type: '',
          street_direction: '',
          unit: '',
          postal_code: parsed.postal || '',
        },
        'city_centroid',
        config,
        ['city', 'province']
      );
      if ((result.confidence ?? 0) >= config.minConfidence) {
        return result;
      }
    }
  }

  const bounds: { province?: string; cityKey?: string; postal?: string } = {};
  if (parsed.province) bounds.province = parsed.province;
  if (parsed.city && parsed.province) {
    bounds.cityKey = buildCityKey(parsed.city, parsed.province);
  } else if (parsed.city && provinces.length === 1) {
    bounds.cityKey = buildCityKey(parsed.city, provinces[0]);
  }
  if (parsed.postal) bounds.postal = normalizePostalCode(parsed.postal);

  const hintLon = qp.lon;
  const hintLat = qp.lat;
  if (hintLon !== undefined && hintLat !== undefined) {
    const nearest = await findNearestNeighbor(env, hintLon, hintLat, config, bounds);
    if (nearest) {
      return assertConfidence(
        buildResult(nearest.row, 'nearest_neighbor', config, ['nearest_neighbor'], nearest.distance),
        config.minConfidence
      );
    }
  }

  throw new OdaGeocodeError('Address not found in ODA database', 'ADDRESS_NOT_FOUND', 404);
}

/**
 * Postal-centroid-only lookup (skips civic exact match and street interpolation).
 * Used for postal-only queries and geocode_method=postal_centroid.
 */
export async function geocodePostalCentroidWithOda(env: Env, qp: QueryParams): Promise<OdaGeocodeResult> {
  const config = getOdaConfig(env);
  if (!env.ODA_DB) {
    throw new OdaGeocodeError('ODA database not configured', 'ODA_NOT_CONFIGURED', 503);
  }
  if (!qp.postal) {
    throw new OdaGeocodeError('Postal code required', 'INVALID_QUERY', 400);
  }

  const parsed = parseAddressQuery({
    postal: qp.postal,
    city: qp.city,
    state: qp.state,
  });
  const provinces = resolveProvinces(parsed, config.provinces);
  const postal = normalizePostalCode(qp.postal);
  if (!postal) {
    throw new OdaGeocodeError('Invalid postal code', 'INVALID_QUERY', 400);
  }

  const centroid = await findPostalCentroid(env, postal, provinces);
  if (!centroid) {
    throw new OdaGeocodeError('Postal code not found in ODA database', 'ADDRESS_NOT_FOUND', 404);
  }

  return assertConfidence(
    buildResult(
      {
        lat: centroid.lat,
        lon: centroid.lon,
        province: centroid.province,
        postal_code: centroid.postal_code,
        city: parsed.city || '',
        civic_number: '',
        street_name: '',
        street_type: '',
        street_direction: '',
        unit: '',
      },
      'postal_centroid',
      config,
      ['postal']
    ),
    config.minConfidence
  );
}

export type OdaBatchGeocodeItem = {
  lon: number;
  lat: number;
  success: boolean;
  error?: string;
  normalizedAddress?: string;
  geocodeMethod?: OdaGeocodeMetadata['geocodeMethod'];
  confidence?: number;
};

/**
 * Batch postal-centroid geocoding via ODA (deduplicates by normalized postal code).
 */
export async function geocodeBatchPostalCentroidsWithOda(
  env: Env,
  queries: QueryParams[]
): Promise<OdaBatchGeocodeItem[]> {
  const results: OdaBatchGeocodeItem[] = queries.map(() => ({
    lon: 0,
    lat: 0,
    success: false,
    error: 'Not processed',
  }));

  if (!isOdaEnabled(env) || !env.ODA_DB) {
    const err = 'ODA geocoding not enabled';
    return results.map(() => ({ lon: 0, lat: 0, success: false, error: err }));
  }

  const postalToIndices = new Map<string, number[]>();

  for (let i = 0; i < queries.length; i++) {
    const qp = queries[i];
    if (!qp.postal) {
      results[i] = { lon: 0, lat: 0, success: false, error: 'Postal code required' };
      continue;
    }
    const postal = normalizePostalCode(qp.postal);
    if (!postal) {
      results[i] = { lon: 0, lat: 0, success: false, error: 'Invalid postal code' };
      continue;
    }
    const list = postalToIndices.get(postal) ?? [];
    list.push(i);
    postalToIndices.set(postal, list);
  }

  for (const [postal, indices] of postalToIndices) {
    const sample = queries[indices[0]];
    try {
      const geocoded = await geocodePostalCentroidWithOda(env, { ...sample, postal });
      const item: OdaBatchGeocodeItem = {
        lon: geocoded.lon,
        lat: geocoded.lat,
        success: true,
        normalizedAddress: geocoded.normalizedAddress,
        geocodeMethod: geocoded.geocodeMethod,
        confidence: geocoded.confidence,
      };
      for (const idx of indices) {
        results[idx] = item;
      }
    } catch (error) {
      const message =
        error instanceof OdaGeocodeError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Geocoding failed';
      for (const idx of indices) {
        results[idx] = { lon: 0, lat: 0, success: false, error: message };
      }
    }
  }

  return results;
}

export async function geocodeBatchWithOda(
  env: Env,
  queries: QueryParams[]
): Promise<OdaBatchGeocodeItem[]> {
  const results: OdaBatchGeocodeItem[] = [];

  for (const qp of queries) {
    if (qp.lat !== undefined && qp.lon !== undefined) {
      results.push({ lon: qp.lon, lat: qp.lat, success: true, geocodeMethod: 'exact' });
      continue;
    }
    if (isPostalOnlyQuery(qp) || qp.geocodeMethod === 'postal_centroid') {
      try {
        const geocoded = await geocodePostalCentroidWithOda(env, qp);
        results.push({
          lon: geocoded.lon,
          lat: geocoded.lat,
          success: true,
          normalizedAddress: geocoded.normalizedAddress,
          geocodeMethod: geocoded.geocodeMethod,
          confidence: geocoded.confidence,
        });
      } catch (error) {
        results.push({
          lon: 0,
          lat: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Geocoding failed',
        });
      }
      continue;
    }
    try {
      const geocoded = await geocodeWithOda(env, qp);
      results.push({
        lon: geocoded.lon,
        lat: geocoded.lat,
        success: true,
        normalizedAddress: geocoded.normalizedAddress,
        geocodeMethod: geocoded.geocodeMethod,
        confidence: geocoded.confidence,
      });
    } catch (error) {
      results.push({
        lon: 0,
        lat: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Geocoding failed',
      });
    }
  }

  return results;
}

export async function reverseGeocodeWithOda(
  env: Env,
  lat: number,
  lon: number
): Promise<OdaGeocodeResult> {
  const config = getOdaConfig(env);
  if (!env.ODA_DB) {
    throw new OdaGeocodeError('ODA database not configured', 'ODA_NOT_CONFIGURED', 503);
  }

  const nearest = await findNearestNeighbor(env, lon, lat, config);
  if (!nearest) {
    throw new OdaGeocodeError('No nearby address found', 'NO_NEARBY_ADDRESS', 404);
  }

  if (nearest.distance > config.maxReverseDistanceMeters) {
    throw new OdaGeocodeError(
      `Nearest address is ${Math.round(nearest.distance)}m away, exceeding maximum`,
      'NO_NEARBY_ADDRESS',
      404
    );
  }

  return assertConfidence(
    buildResult(nearest.row, 'nearest_neighbor', config, ['reverse'], nearest.distance),
    config.minConfidence
  );
}

export async function normalizeAddressWithOda(
  env: Env,
  qp: QueryParams
): Promise<OdaGeocodeResult> {
  return geocodeWithOda(env, qp);
}

export { haversineMeters };
