import {
  Env,
  QueryParams,
  GoogleAddressComponents,
  GoogleGeocodeLocation,
  CircuitBreakerExecutor,
  DeferTaskFn,
  OdaGeocodeMetadata,
} from './types';
import { getRetryConfig } from './config';
import { withRetry, NonRetriableError } from './utils';
import {
  safeValidateGeoGratis,
  safeValidateGoogleGeocode,
  safeValidateNominatim,
  safeValidateMapbox,
} from './validation';
import {
  buildGeocodeQueryString,
  expandStreetAddress,
  googleResultMatchesRegion,
  provinceNameForGoogleComponent,
  selectGeoGratisResult,
} from './geocode-region';
import type { MetricsSink } from './metrics';

// ---------------------------------------------------------------------------
// GeocoderProvider seam
//
// Every outbound geocoder implements one contract: `geocode(input)` resolves to
// ranked candidates or throws a typed error. The registry is data, and the chain
// runner walks it in order. Providers never call each other.
// ---------------------------------------------------------------------------

/** The provider was reachable but failed in a way that may succeed on retry. */
export class ProviderUnavailableError extends Error {
  readonly provider: string;
  constructor(provider: string, message: string) {
    super(message);
    this.name = 'ProviderUnavailableError';
    this.provider = provider;
  }
}

/**
 * The provider answered but had no usable match. Extends `NonRetriableError`, so
 * `withRetry` skips it and the provider chain hands off to the next entry.
 */
export class NoResultsError extends NonRetriableError {
  readonly provider: string;
  constructor(provider: string, message: string) {
    super(message);
    this.name = 'NoResultsError';
    this.provider = provider;
  }
}

/**
 * One result from a provider, best first. The optional `OdaGeocodeMetadata` carries the local
 * resolver's method/confidence so an adapter can be an entry in the same cascade as the free
 * geocoders without a second result type.
 */
export type GeocoderCandidate = {
  lon: number;
  lat: number;
  qualifier?: string;
  score?: number;
  normalizedAddress?: string;
  addressComponents?: GoogleAddressComponents;
} & OdaGeocodeMetadata;

/**
 * Everything a provider needs. An object, so new knobs don't move every call site. The optional
 * orchestration fields are set when a provider runs as a cascade entry (cache/metrics/breaker
 * ownership); raw adapters ignore them.
 */
export type GeocoderProviderInput = {
  env: Env;
  qp: QueryParams;
  query: string;
  request?: Request;
  /** Per-attempt outbound timeout (ms), derived from the stage budget. */
  timeoutMs: number;
  metrics?: MetricsSink;
  circuitBreaker?: CircuitBreakerExecutor;
  deferTask?: DeferTaskFn;
  /** Overall geocoding budget for this request (ms). */
  budgetMs?: number;
  /** Epoch ms when the cascade started; stage limits derive from the remaining budget. */
  startTime?: number;
};

/** The single contract every outbound geocoder implements. */
export interface GeocoderProvider {
  readonly name: string;
  /** Ranked candidates, best first. Throws `NoResultsError` / `ProviderUnavailableError`. */
  geocode(input: GeocoderProviderInput): Promise<GeocoderCandidate[]>;
}

type ProviderValidation<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: unknown[] } };

/**
 * The one outbound protocol: fetch with the canonical user agent and timeout, reject a non-OK
 * status as unavailable, parse JSON, then zod-validate. Keeping it here means the five-line dance
 * exists once, and retry/breaker placement stays with the caller.
 */
async function fetchProviderJson<T>(
  url: string,
  opts: { provider: string; label: string; timeoutMs: number },
  validate: (data: unknown) => ProviderValidation<T>
): Promise<T> {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'riding-lookup/1.0' },
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  if (!resp.ok) {
    throw new ProviderUnavailableError(opts.provider, `${opts.label} error: ${resp.status}`);
  }
  const validation = validate(await resp.json());
  if (!validation.success) {
    console.warn(`[GEOCODING] ${opts.label} response validation failed:`, validation.error.issues);
    throw new NonRetriableError(`${opts.label} API response validation failed`);
  }
  return validation.data;
}

/**
 * Parses Google address_components array into structured address components object.
 * Extracts all available address parts from Google's response.
 */
export function parseGoogleAddressComponents(result: Record<string, unknown>): GoogleAddressComponents | undefined {
  if (!result || !Array.isArray(result.address_components)) {
    return undefined;
  }

  const components: GoogleAddressComponents = {};

  // Helper to find component by type
  const getComponent = (types: string[]): string | undefined => {
    const component = (result.address_components as Array<Record<string, unknown>>).find((comp) =>
      Array.isArray(comp.types) && types.some(type => (comp.types as string[]).includes(type))
    );
    return (component?.long_name as string) || (component?.short_name as string);
  };

  // Extract all address components
  components.street_number = getComponent(['street_number']);
  components.route = getComponent(['route']);
  components.subpremise = getComponent(['subpremise']);
  components.locality = getComponent(['locality']);
  components.administrative_area_level_1 = getComponent(['administrative_area_level_1']);
  components.administrative_area_level_2 = getComponent(['administrative_area_level_2']);
  components.administrative_area_level_3 = getComponent(['administrative_area_level_3']);
  components.administrative_area_level_4 = getComponent(['administrative_area_level_4']);
  components.administrative_area_level_5 = getComponent(['administrative_area_level_5']);
  components.country = getComponent(['country']);
  components.postal_code = getComponent(['postal_code']);
  components.postal_code_suffix = getComponent(['postal_code_suffix']);
  components.neighborhood = getComponent(['neighborhood', 'sublocality']);
  components.sublocality = getComponent(['sublocality']);
  components.sublocality_level_1 = getComponent(['sublocality_level_1']);
  components.sublocality_level_2 = getComponent(['sublocality_level_2']);
  components.sublocality_level_3 = getComponent(['sublocality_level_3']);
  components.sublocality_level_4 = getComponent(['sublocality_level_4']);
  components.sublocality_level_5 = getComponent(['sublocality_level_5']);
  components.premise = getComponent(['premise']);
  components.establishment = getComponent(['establishment']);
  components.point_of_interest = getComponent(['point_of_interest']);
  components.park = getComponent(['park']);
  components.street_address = getComponent(['street_address']);
  components.intersection = getComponent(['intersection']);
  components.political = getComponent(['political']);
  components.colloquial_area = getComponent(['colloquial_area']);
  components.ward = getComponent(['ward']);

  // Add formatted address and other metadata
  if (typeof result.formatted_address === 'string') {
    components.formatted_address = result.formatted_address;
  }
  if (typeof result.place_id === 'string') {
    components.place_id = result.place_id;
  }
  if (Array.isArray(result.types)) {
    components.types = result.types;
  }
  if (result.plus_code && typeof result.plus_code === 'object') {
    components.plus_code = result.plus_code as Record<string, string>;
  }
  const geometry = result.geometry as Record<string, unknown> | undefined;
  if (geometry?.viewport && typeof geometry.viewport === 'object') {
    components.viewport = {
      northeast: (geometry.viewport as Record<string, unknown>).northeast as GoogleGeocodeLocation,
      southwest: (geometry.viewport as Record<string, unknown>).southwest as GoogleGeocodeLocation
    };
  }
  if (geometry?.bounds && typeof geometry.bounds === 'object') {
    components.bounds = {
      northeast: (geometry.bounds as Record<string, unknown>).northeast as GoogleGeocodeLocation,
      southwest: (geometry.bounds as Record<string, unknown>).southwest as GoogleGeocodeLocation
    };
  }

  // Only return if we have at least some components
  const hasAnyComponent = Object.keys(components).some(key =>
    key !== 'formatted_address' && key !== 'place_id' && key !== 'types' &&
    key !== 'plus_code' && key !== 'viewport' && key !== 'bounds' &&
    components[key as keyof GoogleAddressComponents] !== undefined
  );

  return hasAnyComponent || components.formatted_address ? components : undefined;
}

/**
 * GeoGratis (NRCan Geolocator): the primary service. Selection and quality scoring stay in this
 * adapter so the entry reads `qualifier`/`score` off the candidate.
 * https://www.geolocator.api.geo.ca/geolocation/en/locate
 */
const geogratisProvider: GeocoderProvider = {
  name: 'geogratis',
  async geocode({ qp, timeoutMs }) {
    const queryString = buildGeocodeQueryString(qp);
    const params = new URLSearchParams({ q: queryString, expand: 'score,component' });
    const url = `https://www.geolocator.api.geo.ca/geolocation/en/locate?${params.toString()}`;
    const data = await fetchProviderJson(
      url,
      { provider: 'geogratis', label: 'GeoGratis', timeoutMs },
      safeValidateGeoGratis
    );

    if (data.length === 0) {
      console.warn(`[GEOCODING] GeoGratis returned no results`);
      throw new NoResultsError('geogratis', 'GeoGratis returned no results');
    }

    const selected = selectGeoGratisResult(qp, data);
    if (!selected?.geometry?.coordinates || selected.geometry.coordinates.length < 2) {
      console.warn(`[GEOCODING] GeoGratis result missing valid coordinates`);
      throw new NonRetriableError('GeoGratis result missing valid coordinates');
    }

    const lon = selected.geometry.coordinates[0];
    const lat = selected.geometry.coordinates[1];
    if (typeof lon !== 'number' || typeof lat !== 'number' || isNaN(lon) || isNaN(lat)) {
      console.warn(`[GEOCODING] GeoGratis result has invalid coordinates`);
      throw new NonRetriableError('GeoGratis result has invalid coordinates');
    }

    return [{ lon, lat, qualifier: selected.qualifier, score: selected.score }];
  },
};

/**
 * Google Geocoding (BYOK via `X-Google-API-Key` or `GOOGLE_MAPS_KEY`). A miss is a typed
 * `NoResultsError`; the chain — not this adapter — decides to try Nominatim next.
 */
const googleProvider: GeocoderProvider = {
  name: 'google',
  async geocode({ qp, env, request, timeoutMs }) {
    const headerKey = request?.headers.get('X-Google-API-Key');
    const key = headerKey || env.GOOGLE_MAPS_KEY;
    if (!key) {
      throw new NonRetriableError(
        'Google API key not provided. Set X-Google-API-Key header or configure GOOGLE_MAPS_KEY environment variable'
      );
    }
    const params = new URLSearchParams({ key });
    const componentFilters: string[] = [];
    if (qp.postal) componentFilters.push(`postal_code:${qp.postal.replace(/\s+/g, '')}`);
    if (qp.city) componentFilters.push(`locality:${qp.city}`);
    const provinceComponent = provinceNameForGoogleComponent(qp.state);
    if (provinceComponent) componentFilters.push(`administrative_area:${provinceComponent}`);
    const country = (qp.country || 'CA').toUpperCase();
    componentFilters.push(`country:${country}`);
    if (componentFilters.length) params.set('components', componentFilters.join('|'));
    params.set('address', qp.address ? expandStreetAddress(qp.address) : buildGeocodeQueryString(qp));
    params.set('region', 'ca');

    const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
    const data = await fetchProviderJson(
      url,
      { provider: 'google', label: 'Google', timeoutMs },
      safeValidateGoogleGeocode
    );

    if (
      data.status === 'ZERO_RESULTS' ||
      data.status === 'REQUEST_DENIED' ||
      data.status === 'INVALID_REQUEST' ||
      !data.results?.length
    ) {
      console.warn(`[GEOCODING] Google API failed (${data.status || 'no results'}), trying next provider`);
      throw new NoResultsError('google', 'No results from Google');
    }
    if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'UNKNOWN_ERROR') {
      throw new ProviderUnavailableError('google', `Google API error: ${data.status}`);
    }

    const result = data.results[0];
    const loc = result.geometry.location;
    const fmt = result.formatted_address;
    const components = parseGoogleAddressComponents(result);
    if (!googleResultMatchesRegion(qp, components, typeof fmt === 'string' ? fmt : undefined)) {
      console.warn('[GEOCODING] Google result outside requested region, trying next provider');
      throw new NoResultsError('google', 'No results from Google');
    }

    return [
      {
        lon: loc.lng,
        lat: loc.lat,
        ...(typeof fmt === 'string' && fmt.length > 0 && { normalizedAddress: fmt }),
        ...(components && { addressComponents: components }),
      },
    ];
  },
};

/** Nominatim (OpenStreetMap). Reached directly or as the next entry after a Google miss. */
const nominatimProvider: GeocoderProvider = {
  name: 'nominatim',
  async geocode({ qp, query, timeoutMs }) {
    const params = new URLSearchParams({ format: 'jsonv2', limit: '1', country: 'canada' });
    const street = qp.address ? expandStreetAddress(qp.address) : undefined;
    if (street) params.set('street', street);
    if (qp.city) params.set('city', qp.city);
    if (qp.state) {
      const provinceName = provinceNameForGoogleComponent(qp.state);
      params.set('state', provinceName || qp.state);
    }
    if (qp.country) params.set('country', qp.country);
    if (qp.postal) params.set('postalcode', qp.postal);
    if (![qp.address, qp.city, qp.state, qp.country, qp.postal].some(Boolean)) {
      params.set('q', query);
    }
    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
    const results = await fetchProviderJson(
      url,
      { provider: 'nominatim', label: 'Nominatim', timeoutMs },
      safeValidateNominatim
    );

    const first = results?.[0];
    if (!first) {
      console.error('[GEOCODING] Nominatim returned no results');
      throw new NoResultsError('nominatim', 'No results from Nominatim');
    }
    return [{ lon: Number(first.lon), lat: Number(first.lat) }];
  },
};

/** Mapbox Geocoding. */
const mapboxProvider: GeocoderProvider = {
  name: 'mapbox',
  async geocode({ query, env, timeoutMs }) {
    const token = env.MAPBOX_TOKEN;
    if (!token) throw new NonRetriableError('MAPBOX_TOKEN not configured');
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=1&proximity=ca&access_token=${token}`;
    const data = await fetchProviderJson(
      url,
      { provider: 'mapbox', label: 'Mapbox', timeoutMs },
      safeValidateMapbox
    );

    const feat = data?.features?.[0];
    if (!feat?.center) throw new NoResultsError('mapbox', 'No results from Mapbox');
    return [{ lon: feat.center[0], lat: feat.center[1] }];
  },
};

/** The provider catalog. Adding a provider is one adapter plus one entry here. */
export const GEOCODER_PROVIDERS: readonly GeocoderProvider[] = [
  geogratisProvider,
  googleProvider,
  nominatimProvider,
  mapboxProvider,
];

const providerRegistry = new Map<string, GeocoderProvider>(
  GEOCODER_PROVIDERS.map((provider) => [provider.name, provider])
);

/** Register (or replace) a provider by name. Used by the contract suite's stub. */
export function registerGeocoderProvider(provider: GeocoderProvider): void {
  providerRegistry.set(provider.name, provider);
}

/** Remove a provider by name. Test cleanup only. */
export function unregisterGeocoderProvider(name: string): void {
  providerRegistry.delete(name);
}

export function getGeocoderProvider(name: string): GeocoderProvider | undefined {
  return providerRegistry.get(name.toLowerCase());
}

/**
 * Fallback order per configured provider, as data. Google's hidden Nominatim fallback is now just
 * the next entry; the adapters themselves never reach into another provider. An unlisted (or
 * registered-in-tests) name resolves to itself.
 */
const PROVIDER_FALLBACK_CHAINS: Readonly<Record<string, readonly string[]>> = {
  google: ['google', 'nominatim'],
  mapbox: ['mapbox'],
  nominatim: ['nominatim'],
};

export function buildExternalProviderChain(env: Env): GeocoderProvider[] {
  const configured = (env.GEOCODER || 'nominatim').toLowerCase();
  const names = PROVIDER_FALLBACK_CHAINS[configured] ?? [configured];
  const chain = names
    .map((name) => getGeocoderProvider(name))
    .filter((provider): provider is GeocoderProvider => Boolean(provider));
  return chain.length > 0 ? chain : [nominatimProvider];
}

/**
 * Walk a provider chain. `NoResultsError` is a miss and hands off to the next provider; a provider
 * that resolves to an empty set is the same miss, so callers never index into `[]`. Any other
 * error (unavailable, misconfigured) is terminal. This is what makes fallback order data.
 */
async function walkProviderChain(
  chain: readonly GeocoderProvider[],
  input: GeocoderProviderInput
): Promise<GeocoderCandidate[]> {
  let lastMiss: NoResultsError | undefined;
  for (const provider of chain) {
    try {
      const candidates = await provider.geocode(input);
      if (candidates.length > 0) return candidates;
      lastMiss = new NoResultsError(provider.name, `No results from ${provider.name}`);
    } catch (error) {
      if (error instanceof NoResultsError) {
        lastMiss = error;
        continue;
      }
      throw error;
    }
  }
  throw lastMiss ?? new NoResultsError(chain[chain.length - 1]?.name ?? 'unknown', 'No geocoder returned results');
}

export type ProviderChainOptions = {
  /**
   * Wrap the walk in the standard retry policy. Defaults to true only when a circuit breaker is
   * supplied, so a bare `runProviderChain` stays a synchronous-by-nature single pass.
   */
  retries?: boolean;
  /** Wrap the walk in the circuit breaker, keyed by the chain's head provider. */
  circuitBreaker?: CircuitBreakerExecutor;
};

/**
 * The one chain runner: walk providers in order, then optionally wrap that walk in the standard
 * retry and circuit-breaker policy. Retry and failure counting are uniform because every provider
 * call goes through here.
 */
export async function runProviderChain(
  chain: readonly GeocoderProvider[],
  input: GeocoderProviderInput,
  options: ProviderChainOptions = {}
): Promise<GeocoderCandidate[]> {
  const name = chain[0]?.name ?? 'unknown';
  const shouldRetry = options.retries ?? Boolean(options.circuitBreaker);
  const attempt = shouldRetry
    ? () => withRetry(() => walkProviderChain(chain, input), getRetryConfig(), `Geocoding ${name}`)
    : () => walkProviderChain(chain, input);
  if (!options.circuitBreaker) return attempt();
  return (await options.circuitBreaker.execute(`geocoding:${name}`, attempt)) as GeocoderCandidate[];
}
