import {
  Env,
  QueryParams,
  LookupResult,
  GoogleAddressComponents,
  CanadaPostStyleAddress,
  CircuitBreakerExecutor,
  DeferTaskFn,
} from './types';
import { generateLookupCacheKey, getCachedLookupResult, setCachedLookupResult } from './cache';
import { pickDataset, provincePathFromFederalProperties, withTimeout } from './utils';
import { resolveLookupPath } from './return-selector';
import { resolveNormalizedAddress } from './oda-handlers';
import { isOdaEnabled } from './oda-config';
import { normalizeAddressWithGoogle } from './geocoding';
import { incrementMetric } from './metrics';

export type ProvinceData = {
  riding: string;
  properties: Record<string, unknown>;
  dataset: string;
};

export interface NormalizedAddressContext {
  normalizedAddress?: string;
  addressComponents?: GoogleAddressComponents;
  mailingAddress?: CanadaPostStyleAddress;
  geocodeMethod?: string;
  geocodeConfidence?: number;
}

export interface ExpandedLookupPayload {
  riding?: string;
  properties: Record<string, unknown> | null;
  province_data?: ProvinceData | null;
  municipality?: string;
  normalizedAddress?: string;
  addressComponents?: GoogleAddressComponents;
  geocode?: { method: string; confidence?: number };
  cacheStatus: 'HIT' | 'MISS' | 'PARTIAL';
}

export type LookupRidingFn = (
  env: Env,
  pathname: string,
  lon: number,
  lat: number
) => Promise<LookupResult>;

export type GeocodeIfNeededFn = (
  env: Env,
  query: QueryParams,
  request?: Request,
  circuitBreaker?: CircuitBreakerExecutor
) => Promise<{
  lon: number;
  lat: number;
  normalizedAddress?: string;
  addressComponents?: GoogleAddressComponents;
  mailingAddress?: CanadaPostStyleAddress;
  geocodeMethod?: string;
  confidence?: number;
}>;

export type { DeferTaskFn };

async function runOrDefer(deferTask: DeferTaskFn | undefined, task: Promise<void>): Promise<void> {
  if (deferTask) {
    deferTask(task);
  } else {
    await task;
  }
}

type ProvinceFetchResult = {
  data: ProvinceData | null;
  cacheHit: boolean;
};

function provinceDataFromCache(
  cachedProv: LookupResult,
  provincePath: string
): ProvinceData {
  return {
    riding: cachedProv.riding ?? '',
    properties: cachedProv.properties ?? {},
    dataset: pickDataset(provincePath).r2Key.replace('.geojson', ''),
  };
}

export function extractMunicipality(
  addressComponents?: GoogleAddressComponents,
  mailingAddress?: CanadaPostStyleAddress,
  queryCity?: string
): string | undefined {
  if (mailingAddress?.municipality) {
    return mailingAddress.municipality;
  }
  if (addressComponents?.locality) {
    return addressComponents.locality;
  }
  if (queryCity) {
    return queryCity;
  }
  return undefined;
}

export function applyMunicipalityToProperties(
  properties: Record<string, unknown> | null,
  municipality?: string
): Record<string, unknown> | null {
  if (!municipality || !properties) {
    return properties;
  }
  return { ...properties, MUNICIPALITY: municipality };
}

export async function resolveAddressContext(
  env: Env,
  lat: number,
  lon: number,
  query: QueryParams,
  request?: Request,
  circuitBreaker?: CircuitBreakerExecutor,
  existing?: NormalizedAddressContext
): Promise<NormalizedAddressContext> {
  if (existing?.normalizedAddress || existing?.addressComponents || existing?.mailingAddress) {
    return existing;
  }

  if (isOdaEnabled(env)) {
    const odaNorm = await resolveNormalizedAddress(env, lat, lon, query, request, circuitBreaker);
    if (odaNorm) {
      return {
        normalizedAddress: odaNorm.normalizedAddress,
        addressComponents: odaNorm.addressComponents,
        mailingAddress: odaNorm.mailingAddress,
      };
    }
    return {};
  }

  if (request?.headers.get('X-Google-API-Key') || env.GOOGLE_MAPS_KEY) {
    const googleResult = await normalizeAddressWithGoogle(env, lat, lon, request, circuitBreaker);
    if (googleResult) {
      return {
        normalizedAddress: googleResult.formattedAddress,
        addressComponents: googleResult.components,
      };
    }
  }

  return {};
}

export async function fetchProvinceData(
  env: Env,
  lon: number,
  lat: number,
  federalProperties: Record<string, unknown> | null,
  query: QueryParams,
  lookupRiding: LookupRidingFn,
  deferTask?: DeferTaskFn
): Promise<ProvinceFetchResult> {
  const provincePath = provincePathFromFederalProperties(federalProperties);
  if (!provincePath) {
    return { data: null, cacheHit: false };
  }

  const provinceCacheKey = generateLookupCacheKey({ ...query, lon, lat }, provincePath);
  const cachedProv = await getCachedLookupResult(env, provinceCacheKey);
  if (cachedProv) {
    incrementMetric('lookupCacheHits');
    return { data: provinceDataFromCache(cachedProv, provincePath), cacheHit: true };
  }

  incrementMetric('lookupCacheMisses');
  try {
    const provLookup = await lookupRiding(env, provincePath, lon, lat);
    const { r2Key } = pickDataset(provincePath);
    const dataset = r2Key.replace('.geojson', '');
    const toCache: LookupResult = {
      properties: provLookup.properties,
      riding: provLookup.riding,
    };
    await runOrDefer(
      deferTask,
      setCachedLookupResult(env, provinceCacheKey, toCache, dataset, { lon, lat })
    );
    return {
      data: {
        riding: provLookup.riding ?? '',
        properties: provLookup.properties ?? {},
        dataset,
      },
      cacheHit: false,
    };
  } catch {
    return { data: null, cacheHit: false };
  }
}

function computeCombinedCacheStatus(
  federalCacheHit: boolean,
  needsProvince: boolean,
  provinceCacheHit: boolean,
  provinceData: ProvinceData | null | undefined
): 'HIT' | 'MISS' | 'PARTIAL' {
  if (!needsProvince) {
    return federalCacheHit ? 'HIT' : 'MISS';
  }
  if (federalCacheHit && (provinceCacheHit || provinceData === null)) {
    return 'HIT';
  }
  if (federalCacheHit || provinceCacheHit) {
    return 'PARTIAL';
  }
  return 'MISS';
}

export function buildExpandedLookupPayload(
  base: LookupResult,
  returnFields: readonly string[],
  lookupPathname: string,
  options: {
    includeProvince?: boolean;
    provinceData?: ProvinceData | null;
    addressContext?: NormalizedAddressContext;
    queryCity?: string;
    cacheStatus?: 'HIT' | 'MISS' | 'PARTIAL';
  } = {}
): ExpandedLookupPayload {
  const includeProvince = options.includeProvince ?? false;
  const includeMunicipality = returnFields.includes('municipality');

  const addressContext = options.addressContext ?? {};
  const municipality = includeMunicipality
    ? extractMunicipality(
        addressContext.addressComponents ?? base.addressComponents,
        addressContext.mailingAddress,
        options.queryCity
      )
    : undefined;

  const properties = includeMunicipality
    ? applyMunicipalityToProperties(base.properties, municipality)
    : base.properties;

  const payload: ExpandedLookupPayload = {
    riding: base.riding,
    properties,
    cacheStatus: options.cacheStatus ?? 'MISS',
  };

  if (addressContext.geocodeMethod) {
    payload.geocode = {
      method: addressContext.geocodeMethod,
      confidence: addressContext.geocodeConfidence,
    };
  }

  if (includeProvince && resolveLookupPath(lookupPathname).isFederal) {
    payload.province_data = options.provinceData ?? null;
  }

  if (includeMunicipality && municipality) {
    payload.municipality = municipality;
  }

  return payload;
}

/** Response fields shared by HTTP lookup and batch lookup. */
export function expandedLookupResponseFields(expanded: ExpandedLookupPayload): {
  riding?: string;
  properties: Record<string, unknown> | null;
  province_data?: ProvinceData | null;
  municipality?: string;
  normalizedAddress?: string;
  addressComponents?: GoogleAddressComponents;
  geocode?: { method: string; confidence?: number };
} {
  return {
    riding: expanded.riding,
    properties: expanded.properties,
    ...(expanded.province_data !== undefined && { province_data: expanded.province_data }),
    ...(expanded.municipality && { municipality: expanded.municipality }),
    ...(expanded.normalizedAddress && { normalizedAddress: expanded.normalizedAddress }),
    ...(expanded.addressComponents && { addressComponents: expanded.addressComponents }),
    ...(expanded.geocode && { geocode: expanded.geocode }),
  };
}

async function resolveCoordinates(
  env: Env,
  sanitizedQuery: QueryParams,
  cachedPoint: { lon: number; lat: number } | undefined,
  options: {
    lon?: number;
    lat?: number;
    request?: Request;
    circuitBreaker?: CircuitBreakerExecutor;
    geocodeIfNeeded?: GeocodeIfNeededFn;
    geocodingTimeoutMs?: number;
    addressContext?: NormalizedAddressContext;
  }
): Promise<{ lon: number; lat: number; addressContext?: NormalizedAddressContext }> {
  if (options.lon !== undefined && options.lat !== undefined) {
    return { lon: options.lon, lat: options.lat, addressContext: options.addressContext };
  }
  if (sanitizedQuery.lon !== undefined && sanitizedQuery.lat !== undefined) {
    return {
      lon: sanitizedQuery.lon,
      lat: sanitizedQuery.lat,
      addressContext: options.addressContext,
    };
  }
  if (cachedPoint) {
    return { lon: cachedPoint.lon, lat: cachedPoint.lat, addressContext: options.addressContext };
  }
  if (!options.geocodeIfNeeded || options.geocodingTimeoutMs === undefined) {
    throw new Error('Coordinates required: provide lat/lon or enable geocoding');
  }
  const geocodeResult = await withTimeout(
    options.geocodeIfNeeded(env, sanitizedQuery, options.request, options.circuitBreaker),
    options.geocodingTimeoutMs,
    'Geocoding'
  );
  return {
    lon: geocodeResult.lon,
    lat: geocodeResult.lat,
    addressContext: {
      normalizedAddress: geocodeResult.normalizedAddress,
      addressComponents: geocodeResult.addressComponents,
      mailingAddress: geocodeResult.mailingAddress,
      geocodeMethod: geocodeResult.geocodeMethod,
      geocodeConfidence: geocodeResult.confidence,
      ...options.addressContext,
    },
  };
}

export async function performExpandedLookup(
  env: Env,
  lookupPathname: string,
  sanitizedQuery: QueryParams,
  lookupRiding: LookupRidingFn,
  options: {
    lon?: number;
    lat?: number;
    request?: Request;
    circuitBreaker?: CircuitBreakerExecutor;
    geocodeIfNeeded?: GeocodeIfNeededFn;
    geocodingTimeoutMs?: number;
    addressContext?: NormalizedAddressContext;
    deferTask?: DeferTaskFn;
  } = {}
): Promise<ExpandedLookupPayload & { point: { lon: number; lat: number } }> {
  const { datasetPath, isFederal } = resolveLookupPath(lookupPathname);
  const returnFields = sanitizedQuery.returnFields ?? [];
  const includeProvince = sanitizedQuery.includeProvince ?? false;
  const cacheKey = generateLookupCacheKey(sanitizedQuery, datasetPath);
  const cached = await getCachedLookupResult(env, cacheKey);

  const { lon, lat, addressContext: resolvedAddressContext } = await resolveCoordinates(
    env,
    sanitizedQuery,
    cached?.point,
    options
  );

  let baseResult: LookupResult;
  let federalCacheHit = false;

  if (cached) {
    incrementMetric('lookupCacheHits');
    federalCacheHit = true;
    baseResult = {
      properties: cached.properties,
      riding: cached.riding,
      normalizedAddress: cached.normalizedAddress,
      addressComponents: cached.addressComponents,
    };
  } else {
    incrementMetric('lookupCacheMisses');
    const lookup = await lookupRiding(env, datasetPath, lon, lat);
    baseResult = lookup;
    const { r2Key } = pickDataset(datasetPath);
    const dataset = r2Key.replace('.geojson', '');
    await runOrDefer(
      options.deferTask,
      setCachedLookupResult(
        env,
        cacheKey,
        {
          properties: lookup.properties,
          riding: lookup.riding,
          normalizedAddress: lookup.normalizedAddress,
          addressComponents: lookup.addressComponents,
        },
        dataset,
        { lon, lat }
      )
    );
  }

  const needsMunicipality = returnFields.includes('municipality');
  const needsProvince = includeProvince && isFederal;

  let addressContext = resolvedAddressContext;
  let provinceData: ProvinceData | null | undefined;
  let provinceCacheHit = false;

  if (needsMunicipality && needsProvince) {
    const [resolvedCtx, provinceResult] = await Promise.all([
      resolveAddressContext(
        env,
        lat,
        lon,
        sanitizedQuery,
        options.request,
        options.circuitBreaker,
        addressContext
      ),
      fetchProvinceData(
        env,
        lon,
        lat,
        baseResult.properties,
        sanitizedQuery,
        lookupRiding,
        options.deferTask
      ),
    ]);
    addressContext = resolvedCtx;
    provinceData = provinceResult.data;
    provinceCacheHit = provinceResult.cacheHit;
  } else if (needsMunicipality) {
    addressContext = await resolveAddressContext(
      env,
      lat,
      lon,
      sanitizedQuery,
      options.request,
      options.circuitBreaker,
      addressContext
    );
  } else if (needsProvince) {
    const provinceResult = await fetchProvinceData(
      env,
      lon,
      lat,
      baseResult.properties,
      sanitizedQuery,
      lookupRiding,
      options.deferTask
    );
    provinceData = provinceResult.data;
    provinceCacheHit = provinceResult.cacheHit;
  }

  const cacheStatus = computeCombinedCacheStatus(
    federalCacheHit,
    needsProvince,
    provinceCacheHit,
    provinceData
  );

  const payload = buildExpandedLookupPayload(baseResult, returnFields, lookupPathname, {
    includeProvince,
    provinceData,
    addressContext,
    queryCity: sanitizedQuery.city,
    cacheStatus,
  });

  return { ...payload, point: { lon, lat } };
}
