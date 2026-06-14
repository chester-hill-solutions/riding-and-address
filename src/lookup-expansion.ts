import {
  Env,
  QueryParams,
  LookupResult,
  GoogleAddressComponents,
  CanadaPostStyleAddress,
  TimeoutConfig,
} from './types';
import { generateLookupCacheKey, getCachedLookupResult, setCachedLookupResult } from './cache';
import { pickDataset, provincePathFromFederalProperties } from './utils';
import { isFederalLookupPath, ReturnField, wantsReturnField } from './return-selector';
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
}

export interface ExpandedLookupPayload {
  riding?: string;
  properties: Record<string, unknown> | null;
  province_data?: ProvinceData | null;
  municipality?: string;
  normalizedAddress?: string;
  addressComponents?: GoogleAddressComponents;
  cacheStatus: 'HIT' | 'MISS' | 'PARTIAL';
}

type LookupRidingFn = (
  env: Env,
  pathname: string,
  lon: number,
  lat: number
) => Promise<LookupResult>;

type CircuitBreakerExecutor = {
  execute: (key: string, fn: () => Promise<unknown>) => Promise<unknown>;
};

const FEDERAL_PATH = '/api/federal';

function baseLookupPathname(pathname: string): string {
  if (pathname === '/api' || pathname === '/api/combined') {
    return FEDERAL_PATH;
  }
  return pathname;
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
  lookupRiding: LookupRidingFn
): Promise<ProvinceData | null> {
  const provincePath = provincePathFromFederalProperties(federalProperties);
  if (!provincePath) {
    return null;
  }

  const provinceCacheKey = generateLookupCacheKey({ ...query, lon, lat }, provincePath);
  const cachedProv = await getCachedLookupResult(env, provinceCacheKey);
  if (cachedProv) {
    incrementMetric('lookupCacheHits');
    return {
      riding: cachedProv.riding ?? '',
      properties: (cachedProv.properties || {}) as Record<string, unknown>,
      dataset: pickDataset(provincePath).r2Key.replace('.geojson', ''),
    };
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
    await setCachedLookupResult(env, provinceCacheKey, toCache, dataset, { lon, lat });
    return {
      riding: provLookup.riding ?? '',
      properties: (provLookup.properties || {}) as Record<string, unknown>,
      dataset,
    };
  } catch {
    return null;
  }
}

export function buildExpandedLookupPayload(
  base: LookupResult,
  returnFields: ReturnField[],
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
  const includeMunicipality = wantsReturnField(returnFields, 'municipality');

  const addressContext = options.addressContext ?? {};
  const municipality = includeMunicipality
    ? extractMunicipality(
        addressContext.addressComponents ?? base.addressComponents,
        addressContext.mailingAddress,
        options.queryCity
      )
    : undefined;

  const properties = includeMunicipality
    ? applyMunicipalityToProperties(base.properties as Record<string, unknown> | null, municipality)
    : (base.properties as Record<string, unknown> | null);

  const payload: ExpandedLookupPayload = {
    riding: base.riding,
    properties,
    cacheStatus: options.cacheStatus ?? 'MISS',
  };

  if (includeProvince && isFederalLookupPath(lookupPathname)) {
    payload.province_data = options.provinceData ?? null;
  }

  if (includeMunicipality && municipality) {
    payload.municipality = municipality;
  }

  const normalizedAddress = addressContext.normalizedAddress ?? base.normalizedAddress;
  const addressComponents = addressContext.addressComponents ?? base.addressComponents;
  if (normalizedAddress) {
    payload.normalizedAddress = normalizedAddress;
  }
  if (addressComponents) {
    payload.addressComponents = addressComponents;
  }

  return payload;
}

export async function performExpandedLookup(
  env: Env,
  lookupPathname: string,
  sanitizedQuery: QueryParams,
  returnFields: ReturnField[],
  includeProvince: boolean,
  lookupRiding: LookupRidingFn,
  options: {
    lon: number;
    lat: number;
    request?: Request;
    circuitBreaker?: CircuitBreakerExecutor;
    timeoutConfig?: TimeoutConfig;
    preloadedResult?: LookupResult;
    preloadedCacheStatus?: 'HIT' | 'MISS' | 'PARTIAL';
    addressContext?: NormalizedAddressContext;
  }
): Promise<ExpandedLookupPayload> {
  const basePath = baseLookupPathname(lookupPathname);
  const cacheKey = generateLookupCacheKey(sanitizedQuery, basePath);

  let baseResult = options.preloadedResult;
  let cacheStatus = options.preloadedCacheStatus ?? 'MISS';
  const federalCacheHit = cacheStatus === 'HIT';

  if (!baseResult) {
    const cached = await getCachedLookupResult(env, cacheKey);
    if (cached) {
      incrementMetric('lookupCacheHits');
      cacheStatus = 'HIT';
      baseResult = {
        properties: cached.properties,
        riding: cached.riding,
        normalizedAddress: cached.normalizedAddress,
        addressComponents: cached.addressComponents,
      };
    }
  }

  if (!baseResult) {
    incrementMetric('lookupCacheMisses');
    const lookup = await lookupRiding(env, basePath, options.lon, options.lat);
    baseResult = lookup;
    const { r2Key } = pickDataset(basePath);
    const dataset = r2Key.replace('.geojson', '');
    await setCachedLookupResult(
      env,
      cacheKey,
      {
        properties: lookup.properties,
        riding: lookup.riding,
        normalizedAddress: lookup.normalizedAddress,
        addressComponents: lookup.addressComponents,
      },
      dataset,
      { lon: options.lon, lat: options.lat }
    );
  }

  const needsMunicipality = wantsReturnField(returnFields, 'municipality');
  const needsProvince = includeProvince && isFederalLookupPath(lookupPathname);

  let addressContext = options.addressContext;
  if (needsMunicipality) {
    addressContext = await resolveAddressContext(
      env,
      options.lat,
      options.lon,
      sanitizedQuery,
      options.request,
      options.circuitBreaker,
      addressContext
    );
  }

  let provinceData: ProvinceData | null | undefined;
  let provinceCacheHit = false;
  if (needsProvince) {
    const provincePath = provincePathFromFederalProperties(baseResult.properties as Record<string, unknown> | null);
    if (provincePath) {
      const provinceCacheKey = generateLookupCacheKey(
        { ...sanitizedQuery, lon: options.lon, lat: options.lat },
        provincePath
      );
      const cachedProv = await getCachedLookupResult(env, provinceCacheKey);
      provinceCacheHit = !!cachedProv;
      if (cachedProv) {
        incrementMetric('lookupCacheHits');
        provinceData = {
          riding: cachedProv.riding ?? '',
          properties: (cachedProv.properties || {}) as Record<string, unknown>,
          dataset: pickDataset(provincePath).r2Key.replace('.geojson', ''),
        };
      } else {
        provinceData = await fetchProvinceData(
          env,
          options.lon,
          options.lat,
          baseResult.properties as Record<string, unknown> | null,
          sanitizedQuery,
          lookupRiding
        );
      }
    } else {
      provinceData = null;
    }

    if (federalCacheHit && (provinceCacheHit || provinceData === null)) {
      cacheStatus = 'HIT';
    } else if (federalCacheHit || provinceCacheHit) {
      cacheStatus = 'PARTIAL';
    } else {
      cacheStatus = 'MISS';
    }
  } else if (federalCacheHit) {
    cacheStatus = 'HIT';
  }

  return buildExpandedLookupPayload(baseResult, returnFields, lookupPathname, {
    includeProvince,
    provinceData,
    addressContext,
    queryCity: sanitizedQuery.city,
    cacheStatus,
  });
}
