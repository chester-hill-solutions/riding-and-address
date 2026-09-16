import {
  Env,
  Metrics,
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
  DEFAULT_STREET_TYPES,
  buildCityKey,
  buildSearchKey,
  buildStreetKey,
  normalizePostalCode,
  normalizeSearchToken,
  normalizeUnit,
  parseAddressQuery,
} from './oda-normalize';
import { expandCityCandidates } from './oda-city-aliases';
import { withCitySource } from './oda-source';
import { incrementMetric } from './metrics';
import { expandStreetAddress } from './geocode-region';
import { formatFromOdaRow } from './canada-post-format';
import {
  createOdaD1Tracker,
  recordOdaD1Query,
  type OdaD1Tracker,
} from './oda-d1-tracker';
import { getAddressStore, type AddressStore } from './address-store';

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

/** True when an ODA error reflects a service/config problem, not a normal address miss. */
export function isOdaServiceFailure(error: unknown): boolean {
  if (!(error instanceof OdaGeocodeError)) {
    return true;
  }
  return error.code === 'ODA_NOT_CONFIGURED';
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

/** Per-method usage counter, so the local resolution mix is visible. */
const ODA_METHOD_METRIC: Record<OdaGeocodeMethod, keyof Metrics> = {
  exact: 'geocodingOdaMethodExact',
  postal_street: 'geocodingOdaMethodPostalStreet',
  postal_centroid: 'geocodingOdaMethodPostalCentroid',
  street_interpolated: 'geocodingOdaMethodStreetInterpolated',
  city_centroid: 'geocodingOdaMethodCityCentroid',
  nearest_neighbor: 'geocodingOdaMethodNearest',
};

function buildResult(
  row: Partial<OdaAddressRow> & { lat: number; lon: number; province: string },
  method: OdaGeocodeMethod,
  config: ReturnType<typeof getOdaConfig>,
  matchedFields: string[],
  distanceMeters?: number,
  confidenceOverride?: number
): OdaGeocodeResult {
  incrementMetric(ODA_METHOD_METRIC[method]);
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

function streetTypeCandidates(parsed: ReturnType<typeof parseAddressQuery>): string[] {
  return parsed.streetType ? [parsed.streetType] : [...DEFAULT_STREET_TYPES];
}

function buildStreetKeyVariants(parsed: ReturnType<typeof parseAddressQuery>): string[] {
  return streetTypeCandidates(parsed).map((streetType) =>
    buildStreetKey(parsed.streetName!, streetType, parsed.streetDirection || '')
  );
}

/** Resolve the ODA read store for a request, attributing each read to its tracker. */
function storeFor(env: Env, tracker?: OdaD1Tracker): AddressStore {
  const record = tracker ? () => tracker.record() : () => recordOdaD1Query();
  return getAddressStore(env.ODA_DB!, record);
}

/**
 * Ceiling on candidate search keys per query.
 *
 * City aliases and street-tail readings multiply: Toronto alone expands to 14 spellings,
 * and an address like "399 The West Mall" yields 6 readings. D1 rejects a statement with
 * too many bound variables ("too many SQL variables"), so the product has to be capped
 * rather than left to grow. Keys are ordered most-literal first, so truncation drops the
 * least likely candidates.
 */
const MAX_EXACT_SEARCH_KEYS = 60;

/** Rows fetched before ranking. Exact-key hits are rare, so this is ample. */
const EXACT_FETCH_LIMIT = 50;

/**
 * Resolve an exact address, trying every ODA spelling of the city and each reading of
 * the street tail.
 *
 * `searchKeys` is ordered most-literal first, and `literalCityKeys` marks those built
 * from the caller's own city. A literal-city match wins outright. Otherwise the aliases
 * are considered, and a match spanning more than one municipality is reported as
 * ambiguous rather than resolved arbitrarily: ~1,754 civic+street combinations exist in
 * more than one of Toronto's former municipalities, and picking one at random would
 * return a plausible but wrong coordinate — and therefore, potentially, the wrong riding.
 *
 * Ranking happens here rather than in SQL: an `ORDER BY CASE search_key ...` would double
 * the bound parameters for ordering that costs nothing in JS.
 */
async function findExactMatch(
  store: AddressStore,
  searchKeys: string[],
  literalCityKeys: Set<string>,
  provinces: string[],
  unit: string | undefined
): Promise<OdaAddressRow | null> {
  const allKeys = searchKeys.filter((key) => key.replace(/\|/g, '').trim());
  if (allKeys.length === 0) return null;

  const usableKeys = allKeys.slice(0, MAX_EXACT_SEARCH_KEYS);
  if (allKeys.length > usableKeys.length) {
    console.warn(
      `[ODA] ${allKeys.length} candidate keys exceeded the ${MAX_EXACT_SEARCH_KEYS} cap; dropped ${allKeys.length - usableKeys.length} least-literal candidates`
    );
  }

  const normalizedUnit = normalizeUnit(unit);
  const matched = await store.findExactAddresses({
    searchKeys: usableKeys,
    provinces,
    unit: normalizedUnit || undefined,
    limit: EXACT_FETCH_LIMIT,
  });

  const rank = new Map(usableKeys.map((key, index) => [key, index]));
  const rows = [...matched].sort((a, b) => {
    const byKey =
      (rank.get(a.search_key) ?? usableKeys.length) - (rank.get(b.search_key) ?? usableKeys.length);
    if (byKey !== 0) return byKey;
    // Prefer the base address over one of its units.
    return (!a.unit ? 0 : 1) - (!b.unit ? 0 : 1);
  });

  if (rows.length === 0) return null;

  // The caller's own city matched: no alias ambiguity is possible.
  if (literalCityKeys.has(rows[0].search_key)) return rows[0];

  // Only aliases matched. Distinct municipalities here mean genuinely different
  // places, so refuse rather than guess. Callers treat this as a miss and fall back
  // to a free external geocoder.
  const distinctCities = new Set(rows.map((row) => row.city));
  if (distinctCities.size > 1) {
    throw new OdaGeocodeError(
      `Address matches ${distinctCities.size} municipalities (${[...distinctCities].join(', ')}); specify the municipality to disambiguate`,
      'AMBIGUOUS_LOCATION',
      422
    );
  }

  return rows[0];
}

async function findPostalCentroid(
  store: AddressStore,
  postal: string,
  provinces: string[]
): Promise<{ lat: number; lon: number; province: string; postal_code: string } | null> {
  return store.findPostalCentroid({ postal, provinces });
}

async function findStreetInterpolated(
  store: AddressStore,
  parsed: ReturnType<typeof parseAddressQuery>,
  provinces: string[]
): Promise<OdaAddressRow | null> {
  if (!parsed.city || !parsed.streetName) return null;

  const province = parsed.province || provinces[0];
  // Same alias expansion as the exact path; ordered so the caller's own spelling wins.
  const cityKeys = expandCityCandidates(parsed.city, province).map((city) =>
    buildCityKey(city, province)
  );
  const cityKeyList = cityKeys.length > 0 ? cityKeys : [buildCityKey(parsed.city, province)];

  const streetKeys = buildStreetKeyVariants(parsed);

  if (parsed.civicParsed?.numeric !== null && parsed.civicParsed?.numeric !== undefined) {
    const civic = parsed.civicParsed.raw;
    const normalizedUnit = normalizeUnit(parsed.unit);

    if (normalizedUnit) {
      const exact = await store.findAddressOnStreet({
        provinces,
        cityKeys: cityKeyList,
        streetKeys,
        civic,
        unit: normalizedUnit,
      });
      if (exact) return exact;
      return null;
    }

    const exact = await store.findAddressOnStreet({
      provinces,
      cityKeys: cityKeyList,
      streetKeys,
      civic,
    });
    if (exact) return exact;

    const nearest = await store.findAddressOnStreet({
      provinces,
      cityKeys: cityKeyList,
      streetKeys,
      nearestToCivic: parsed.civicParsed.numeric,
    });
    if (nearest) return nearest;
  }

  const range = await store.findStreetRange({
    provinces,
    cityKeys: cityKeyList,
    streetKeys,
  });

  if (range) {
    const matchedStreetKey = range.street_key || streetKeys[0];
    const matchedType = matchedStreetKey.split('|')[1] || parsed.streetType || '';
    return {
      id: 0,
      province: range.province,
      civic_number: parsed.civic || '',
      street_name: parsed.streetName,
      street_type: matchedType,
      street_direction: parsed.streetDirection || '',
      unit: '',
      postal_code: parsed.postal || '',
      city: parsed.city,
      lat: range.lat,
      lon: range.lon,
      full_address: '',
    };
  }

  return null;
}

/**
 * Resolve a civic + street within a postal code, when no municipality was supplied.
 *
 * The exact `search_key` embeds the city, so an address pasted as "2 Welby Cir, M4B 2Y8" cannot
 * reach the exact tier, and street interpolation bails because it needs a city. Postal codes are
 * indexed and local, so scoping the street match by postal resolves the actual civic point rather
 * than falling through to a coarse postal centroid. Placed after street interpolation so a
 * city-scoped match still wins when a city was given.
 */
async function findByPostalStreet(
  store: AddressStore,
  parsed: ReturnType<typeof parseAddressQuery>,
  provinces: string[]
): Promise<OdaAddressRow | null> {
  if (!parsed.postal || !parsed.streetName || !parsed.civic) return null;

  const postal = normalizePostalCode(parsed.postal);
  if (!postal) return null;

  const streetKeys = buildStreetKeyVariants(parsed);
  if (streetKeys.length === 0) return null;

  const civic = parsed.civicParsed?.raw ?? parsed.civic;

  const rows = await store.findPostalStreetAddresses({
    provinces,
    postal,
    streetKeys,
    civic,
  });

  if (rows.length === 0) return null;

  const rank = new Map(streetKeys.map((key, index) => [key, index]));
  const keyOf = (row: OdaAddressRow) => buildStreetKey(row.street_name, row.street_type, row.street_direction);
  const sorted = [...rows].sort((a, b) => {
    const byKey = (rank.get(keyOf(a)) ?? streetKeys.length) - (rank.get(keyOf(b)) ?? streetKeys.length);
    if (byKey !== 0) return byKey;
    return (!a.unit ? 0 : 1) - (!b.unit ? 0 : 1);
  });

  return sorted[0];
}

async function findCityCentroid(
  store: AddressStore,
  parsed: ReturnType<typeof parseAddressQuery>,
  provinces: string[],
  maxAmbiguousMatches: number
): Promise<{ lat: number; lon: number; province: string; city: string } | null> {
  if (!parsed.city) return null;

  for (const prov of parsed.province ? [parsed.province] : provinces) {
    // A city centroid is a coarse result already, so an alias hit is preferable to a
    // miss; take candidates in preference order and stop at the first that exists.
    const cityKeys = expandCityCandidates(parsed.city, prov).map((city) =>
      buildCityKey(city, prov)
    );
    const cityKeyList = cityKeys.length > 0 ? cityKeys : [buildCityKey(parsed.city, prov)];
    const result = await store.findCityCentroid({ province: prov, cityKeys: cityKeyList });
    if (result) return result;
  }

  const matches = await store.findCityCentroidsByPrefix({
    provinces,
    prefix: normalizeSearchToken(parsed.city),
    limit: maxAmbiguousMatches + 1,
  });

  if (matches.length > maxAmbiguousMatches) {
    throw new OdaGeocodeError(
      'Too many city matches found; provide province to disambiguate',
      'AMBIGUOUS_LOCATION',
      422
    );
  }
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
  store: AddressStore,
  lon: number,
  lat: number,
  config: ReturnType<typeof getOdaConfig>,
  bounds?: { province?: string; cityKey?: string; postal?: string }
): Promise<{ row: OdaAddressRow; distance: number } | null> {
  const bboxSteps = [0.0025, 0.01, 0.05, 0.25];
  let candidates: OdaAddressRow[] = [];

  for (const delta of bboxSteps) {
    candidates = await store.findAddressesInBounds({
      lat,
      lon,
      delta,
      province: bounds?.province,
      cityKey: bounds?.cityKey,
      postal: bounds?.postal,
      limit: config.nnMaxCandidates,
    });
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

function postalCentroidWithinHintDistance(
  centroid: { lat: number; lon: number },
  qp: QueryParams,
  maxDistanceMeters: number
): boolean {
  if (qp.lat === undefined || qp.lon === undefined) return true;
  const distance = haversineMeters(qp.lon, qp.lat, centroid.lon, centroid.lat);
  return distance <= maxDistanceMeters;
}

export async function geocodeWithOda(
  env: Env,
  qp: QueryParams,
  tracker?: OdaD1Tracker
): Promise<OdaGeocodeResult> {
  const config = getOdaConfig(env);
  if (!env.ODA_DB) {
    throw new OdaGeocodeError('ODA database not configured', 'ODA_NOT_CONFIGURED', 503);
  }

  // A caller-supplied tracker is owned (and ended) by that caller; otherwise this call
  // creates its own so no state is shared with a concurrent request.
  if (tracker) {
    return geocodeWithOdaInner(env, qp, config, tracker);
  }

  const owned = createOdaD1Tracker();
  try {
    return await geocodeWithOdaInner(env, qp, config, owned);
  } finally {
    owned.end();
  }
}

async function geocodeWithOdaInner(
  env: Env,
  qp: QueryParams,
  config: ReturnType<typeof getOdaConfig>,
  tracker: OdaD1Tracker
): Promise<OdaGeocodeResult> {
  const store = storeFor(env, tracker);
  const parsed = parseAddressQuery({
    address: qp.address ? expandStreetAddress(qp.address) : undefined,
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

  const province = parsed.province || provinces[0];

  // ODA files many municipalities under a name the caller would never type, so try
  // every known spelling. The caller's own spelling stays first and wins on a match.
  const cityCandidates = expandCityCandidates(parsed.city, province);
  const cities = cityCandidates.length > 0 ? cityCandidates : [parsed.city ?? ''];

  // `parsed` above comes from expandStreetAddress(), which appends "Ave" whenever it
  // fails to recognise a street type. That rescues "757 Victoria Park" — really Victoria
  // Park Ave — but corrupts "1 Leeds Ct" into "1 Leeds Ct Ave". Parse the raw address as
  // well so the heuristic stays one candidate among several rather than a destructive
  // rewrite.
  const parsedRaw = qp.address
    ? parseAddressQuery({ address: qp.address, postal: qp.postal, city: qp.city, state: qp.state })
    : parsed;

  // A trailing token like PARK or MALL is both a street type and an ordinary part of a
  // street name, and ODA has rows filed each way ("RAVINE PARK" with no type, vs "WEST"
  // + type MALL). Try each reading and let the index decide; a wrong one matches nothing.
  const streetReadings: Array<{
    streetName?: string;
    streetType?: string;
    streetDirection?: string;
  }> = [];
  const seenReadings = new Set<string>();
  const addReading = (streetName?: string, streetType?: string, streetDirection?: string) => {
    const id = `${streetName ?? ''}|${streetType ?? ''}|${streetDirection ?? ''}`;
    if (seenReadings.has(id)) return;
    seenReadings.add(id);
    streetReadings.push({ streetName, streetType, streetDirection });
  };

  addReading(parsed.streetName, parsed.streetType, parsed.streetDirection);
  addReading(parsedRaw.streetName, parsedRaw.streetType, parsedRaw.streetDirection);
  if (parsedRaw.streetName && parsedRaw.streetType) {
    addReading(`${parsedRaw.streetName} ${parsedRaw.streetType}`, '', parsedRaw.streetDirection);
  }

  // ODA drops the leading article: not one Ontario street name begins with "THE",
  // though callers reasonably type "399 The West Mall" for 399|WEST|MALL.
  for (const reading of [...streetReadings]) {
    if (reading.streetName && /^THE\s+/i.test(reading.streetName)) {
      addReading(
        reading.streetName.replace(/^THE\s+/i, ''),
        reading.streetType,
        reading.streetDirection
      );
    }
  }

  const keyFor = (
    city: string,
    reading: { streetName?: string; streetType?: string; streetDirection?: string }
  ) =>
    buildSearchKey({
      civic: parsed.civic,
      streetName: reading.streetName,
      streetType: reading.streetType,
      streetDirection: reading.streetDirection,
      city,
      province,
    });

  const searchKeys = cities.flatMap((city) => streetReadings.map((r) => keyFor(city, r)));
  const literalCityKeys = new Set(streetReadings.map((r) => keyFor(cities[0], r)));

  const exact = await findExactMatch(
    store,
    searchKeys,
    literalCityKeys,
    provinces,
    parsed.unit
  );
  if (exact) {
    return withCitySource(
      env,
      assertConfidence(
        buildResult(exact, 'exact', config, ['civic', 'street', 'city', 'province']),
        config.minConfidence
      ),
      exact.city,
      exact.province
    );
  }

  const hasStreetAddress = !!parsed.city && !!(parsed.streetName || parsed.civic);
  if (hasStreetAddress) {
    const street = await findStreetInterpolated(store, parsed, provinces);
    if (street) {
      return withCitySource(
        env,
        assertConfidence(
          buildResult(street, 'street_interpolated', config, ['street', 'city']),
          config.minConfidence
        ),
        street.city,
        street.province
      );
    }
  }

  // A civic + street + postal with no city: the exact tier cannot key on a city, and street
  // interpolation needs one. Match the street within the postal code before settling for a
  // postal centroid.
  if (parsed.postal && parsed.streetName && parsed.civic) {
    const byPostal = await findByPostalStreet(store, parsed, provinces);
    if (byPostal) {
      return withCitySource(
        env,
        assertConfidence(
          buildResult(byPostal, 'postal_street', config, ['civic', 'street', 'postal']),
          config.minConfidence
        ),
        byPostal.city,
        byPostal.province
      );
    }
  }

  if (parsed.postal) {
    const postal = normalizePostalCode(parsed.postal);
    if (postal) {
      const centroid = await findPostalCentroid(store, postal, provinces);
      if (
        centroid &&
        postalCentroidWithinHintDistance(centroid, qp, config.maxPostalCentroidDistanceMeters)
      ) {
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

  if (parsed.city) {
    const cityCentroid = await findCityCentroid(
      store,
      parsed,
      provinces,
      config.maxAmbiguousMatches
    );
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
        return withCitySource(env, result, cityCentroid.city, cityCentroid.province);
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
    const nearest = await findNearestNeighbor(store, hintLon, hintLat, config, bounds);
    if (nearest) {
      return withCitySource(
        env,
        assertConfidence(
          buildResult(nearest.row, 'nearest_neighbor', config, ['nearest_neighbor'], nearest.distance),
          config.minConfidence
        ),
        nearest.row.city,
        nearest.row.province
      );
    }
  }

  throw new OdaGeocodeError('Address not found in ODA database', 'ADDRESS_NOT_FOUND', 404);
}

/**
 * Postal-centroid-only lookup (skips civic exact match and street interpolation).
 * Used for postal-only queries and geocode_method=postal_centroid.
 */
export async function geocodePostalCentroidWithOda(
  env: Env,
  qp: QueryParams,
  tracker?: OdaD1Tracker
): Promise<OdaGeocodeResult> {
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

  const centroid = await findPostalCentroid(storeFor(env, tracker), postal, provinces);
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
  lon: number,
  tracker?: OdaD1Tracker
): Promise<OdaGeocodeResult> {
  const config = getOdaConfig(env);
  if (!env.ODA_DB) {
    throw new OdaGeocodeError('ODA database not configured', 'ODA_NOT_CONFIGURED', 503);
  }

  const nearest = await findNearestNeighbor(storeFor(env, tracker), lon, lat, config);
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

  return withCitySource(
    env,
    assertConfidence(
      buildResult(nearest.row, 'nearest_neighbor', config, ['reverse'], nearest.distance),
      config.minConfidence
    ),
    nearest.row.city,
    nearest.row.province
  );
}

export async function normalizeAddressWithOda(
  env: Env,
  qp: QueryParams
): Promise<OdaGeocodeResult> {
  return geocodeWithOda(env, qp);
}

export { haversineMeters };
