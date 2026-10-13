import { Env, QueryParams, SuggestQueryParams, SuggestResponse } from './types';
import { initializeOdaDatabase, getOdaStats } from './oda-schema';
import { isOdaEnabled, getOdaConfig, getOdaSuggestConfig, ODA_DEFAULTS } from './oda-config';
import type { RouteContext } from './route-context';
import {
  geocodeWithOda,
  reverseGeocodeWithOda,
  normalizeAddressWithOda,
  OdaGeocodeError,
} from './oda-geocoding';
import { searchSuggestions, SuggestError } from './oda-suggest';
import { consumeDailyQuota } from './api-key-usage-do';
import { recordSuccessfulBillable } from './billing';
import {
  generateSuggestCacheKey,
  getCachedSuggestions,
  setCachedSuggestions,
} from './cache';
import { normalizeProvince } from './oda-normalize';
import { parseQuery, badRequest } from './utils';
import { incrementMetric, recordTiming } from './metrics';
import { normalizeAddressWithGoogle } from './geocoding';
import { GoogleAddressComponents, CanadaPostStyleAddress } from './types';

function odaErrorResponse(error: unknown, ctx: RouteContext): Response {
  if (error instanceof OdaGeocodeError) {
    return badRequest(error.message, error.status, error.code, ctx.correlationId);
  }
  const message = error instanceof Error ? error.message : 'ODA geocoding failed';
  return badRequest(message, 500, 'GEOCODING_ERROR', ctx.correlationId);
}

/** CORS + security + correlation headers, matching every other JSON response. */
function odaJsonHeaders(ctx: RouteContext): Record<string, string> {
  return {
    'content-type': 'application/json; charset=UTF-8',
    ...ctx.corsHeaders(ctx.request.headers.get('Origin')),
  };
}

function geocodeJsonResponse(
  ctx: RouteContext,
  query: QueryParams,
  result: Awaited<ReturnType<typeof geocodeWithOda>>
): Response {
  return new Response(
    JSON.stringify({
      query,
      point: { lon: result.lon, lat: result.lat },
      geocodeMethod: result.geocodeMethod,
      confidence: result.confidence,
      matchedFields: result.matchedFields,
      distanceMeters: result.distanceMeters,
      normalizedAddress: result.normalizedAddress,
      mailingAddress: result.mailingAddress,
      addressComponents: result.addressComponents,
      dataSource: result.dataSource,
      correlationId: ctx.correlationId,
    }),
    { headers: odaJsonHeaders(ctx) }
  );
}

export async function handleOdaInit(ctx: RouteContext): Promise<Response> {
  const success = await initializeOdaDatabase(ctx.env);
  return new Response(
    JSON.stringify({
      success,
      message: success ? 'ODA database initialized successfully' : 'ODA database initialization failed',
    }),
    { headers: odaJsonHeaders(ctx) }
  );
}

export async function handleOdaStats(ctx: RouteContext): Promise<Response> {
  const stats = await getOdaStats(ctx.env);
  return new Response(JSON.stringify(stats), { headers: odaJsonHeaders(ctx) });
}

export async function handleGeocodeRoute(ctx: RouteContext): Promise<Response> {
  const { request, env, correlationId } = ctx;
  if (!isOdaEnabled(env)) {
    return badRequest('ODA geocoding is not enabled', 503, 'ODA_NOT_ENABLED', correlationId);
  }

  const { validation } = parseQuery(request);
  if (!validation.valid || !validation.sanitized) {
    return badRequest(validation.error || 'Invalid query', 400, 'INVALID_QUERY', correlationId);
  }

  if (validation.sanitized.lat !== undefined && validation.sanitized.lon !== undefined) {
    return badRequest(
      'Use /api/reverse for coordinate lookups',
      400,
      'INVALID_QUERY',
      correlationId
    );
  }

  try {
    const result = await geocodeWithOda(env, validation.sanitized);
    return geocodeJsonResponse(ctx, validation.sanitized, result);
  } catch (error) {
    return odaErrorResponse(error, ctx);
  }
}

export async function handleReverseRoute(ctx: RouteContext): Promise<Response> {
  const { request, env, correlationId } = ctx;
  if (!isOdaEnabled(env)) {
    return badRequest('ODA geocoding is not enabled', 503, 'ODA_NOT_ENABLED', correlationId);
  }

  const { validation } = parseQuery(request);
  if (!validation.valid || !validation.sanitized) {
    return badRequest(validation.error || 'Invalid query', 400, 'INVALID_QUERY', correlationId);
  }

  if (validation.sanitized.lat === undefined || validation.sanitized.lon === undefined) {
    return badRequest('lat and lon are required', 400, 'INVALID_QUERY', correlationId);
  }

  try {
    const result = await reverseGeocodeWithOda(
      env,
      validation.sanitized.lat,
      validation.sanitized.lon
    );
    return geocodeJsonResponse(ctx, validation.sanitized, result);
  } catch (error) {
    return odaErrorResponse(error, ctx);
  }
}

export async function handleNormalizeAddressRoute(ctx: RouteContext): Promise<Response> {
  const { request, env, correlationId } = ctx;
  if (!isOdaEnabled(env)) {
    return badRequest('ODA geocoding is not enabled', 503, 'ODA_NOT_ENABLED', correlationId);
  }

  const { validation } = parseQuery(request);
  if (!validation.valid || !validation.sanitized) {
    return badRequest(validation.error || 'Invalid query', 400, 'INVALID_QUERY', correlationId);
  }

  try {
    const result = await normalizeAddressWithOda(env, validation.sanitized);
    return new Response(
      JSON.stringify({
        query: validation.sanitized,
        normalizedAddress: result.normalizedAddress,
        mailingAddress: result.mailingAddress,
        addressComponents: result.addressComponents,
        geocodeMethod: result.geocodeMethod,
        confidence: result.confidence,
        dataSource: result.dataSource,
        correlationId,
      }),
      { headers: odaJsonHeaders(ctx) }
    );
  } catch (error) {
    return odaErrorResponse(error, ctx);
  }
}

/**
 * GET /api/search — as-you-type address autocomplete.
 *
 * Returns suggestions only; no riding. The caller takes a suggestion's `location` and calls the
 * existing lookup routes once the user selects one, which is why this path never touches R2.
 */
export async function handleSearchRoute(ctx: RouteContext): Promise<Response> {
  const { request, env, correlationId, startTime, corsHeaders: getCorsHeaders, deferTask, auth } = ctx;
  const origin = request.headers.get('Origin');
  const config = getOdaSuggestConfig(env);
  const url = ctx.url;

  incrementMetric('suggestRequests');

  // The browser-key/server gate and its denial already ran in the prelude; the accepted outcome
  // is on `ctx.auth`. This handler owns only the quota and billing that follow an accepted request.

  // Post-auth CORS: when a browser key's origin allowlist just matched this Origin, echo the
  // origin (with Vary) instead of the env-level wildcard, so browsers and shared caches scope
  // the response to the origin that was actually authorized. Never adds Allow-Credentials —
  // that stays reserved for origins matched against ALLOWED_ORIGINS in getCorsHeaders.
  const corsHeaders = (): Record<string, string> => {
    const headers = getCorsHeaders(origin);
    if (auth.key && origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Vary'] = 'Origin';
    }
    return headers;
  };

  if (auth.key) {
    const usage = await consumeDailyQuota(env, auth.key.id, auth.key.dailyLimit);
    if (!usage.allowed) {
      incrementMetric('suggestKeyDenials');
      return new Response(
        JSON.stringify({
          error: `Daily limit of ${usage.limit} requests reached for this key. It resets at 00:00 UTC.`,
          code: 'DAILY_LIMIT_EXCEEDED',
          correlationId,
        }),
        {
          status: 429,
          headers: {
            'content-type': 'application/json; charset=UTF-8',
            'Retry-After': String(secondsUntilUtcMidnight()),
            ...corsHeaders(),
          },
        }
      );
    }
  }

  let params: SuggestQueryParams;
  try {
    params = parseSuggestQuery(url, env, config.limit, config.maxLimit);
  } catch (error) {
    return suggestErrorResponse(error, correlationId, corsHeaders());
  }

  const respond = async (
    suggestions: SuggestResponse['suggestions'],
    provinces: string[],
    cacheStatus: 'HIT' | 'MISS',
    maxAge: number,
    nextCursor?: string
  ): Promise<Response> => {
    // Billable unit: successful HTTP 200 search (including cache hits). Operator BASIC_AUTH skip.
    if (auth.key && auth.customer) {
      const billed = await recordSuccessfulBillable(
        env,
        { key: auth.key, customer: auth.customer },
        { waitUntil: deferTask }
      );
      if (!billed.allowed) {
        // Same single shaper, with this route's origin-aware CORS policy.
        return ctx.billableDenial(billed, corsHeaders());
      }
    }

    const body: SuggestResponse = {
      query: {
        q: params.q,
        province: url.searchParams.get('province') || undefined,
        limit: params.limit,
        containerId: params.containerId,
      },
      suggestions,
      ...(nextCursor ? { nextCursor } : {}),
      provinces,
      dataSource: { provider: ODA_DEFAULTS.PROVIDER, version: getOdaConfig(env).dataVersion },
      correlationId,
    };
    return new Response(JSON.stringify(body), {
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        // A shared edge cache in front of an authenticated endpoint would serve one tenant's
        // results to another, so only go public when no basic auth is configured.
        'Cache-Control': env.BASIC_AUTH
          ? `private, max-age=${maxAge}`
          : `public, max-age=${maxAge}, s-maxage=${maxAge * 5}`,
        'X-Cache-Status': cacheStatus,
        ...corsHeaders(),
      },
    });
  };

  const cacheKey = generateSuggestCacheKey(params);
  const cached = await getCachedSuggestions(env, cacheKey, config.cacheTtlSeconds);
  if (cached) {
    incrementMetric('suggestCacheHits');
    recordTiming('totalSuggestTime', Date.now() - startTime);
    return respond(cached.suggestions, cached.provinces, 'HIT', 60, cached.nextCursor);
  }
  incrementMetric('suggestCacheMisses');

  try {
    const result = await searchSuggestions(env, params);

    // An empty result for a too-short query is stable and worth caching hard at the edge; it is
    // normal typing, not an error.
    const isShortQuery = params.q.trim().length < config.minQueryLength;
    if (!isShortQuery) {
      const fill = setCachedSuggestions(
        env,
        cacheKey,
        result.suggestions,
        result.provinces,
        config.cacheTtlSeconds,
        result.nextCursor
      );
      if (deferTask) deferTask(fill);
      else await fill;
    }

    // Empty results are the signal that matters most here: a rising rate means the index is
    // missing data or the query shape is wrong, and it is invisible from status codes alone
    // (an empty result is a perfectly good 200).
    if (!isShortQuery && result.suggestions.length === 0) incrementMetric('suggestEmptyResults');

    recordTiming('totalSuggestTime', Date.now() - startTime);
    return respond(result.suggestions, result.provinces, 'MISS', isShortQuery ? 86400 : 60, result.nextCursor);
  } catch (error) {
    incrementMetric('suggestErrors');
    recordTiming('totalSuggestTime', Date.now() - startTime);
    return suggestErrorResponse(error, correlationId, corsHeaders());
  }
}

function parseSuggestQuery(
  url: URL,
  env: Env,
  defaultLimit: number,
  maxLimit: number
): SuggestQueryParams {
  const q = url.searchParams.get('q') ?? url.searchParams.get('query') ?? '';
  if (!q.trim()) {
    throw new SuggestError('q is required', 'INVALID_QUERY', 400);
  }

  const rawLimit = parseInt(url.searchParams.get('limit') || '', 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), maxLimit)
    : defaultLimit;

  const provinceParam = url.searchParams.get('province');
  let provinces: string[] = [];
  if (provinceParam) {
    provinces = provinceParam
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const code = normalizeProvince(p);
        if (!code) throw new SuggestError(`Unknown province: ${p}`, 'INVALID_QUERY', 400);
        return code;
      });
  } else {
    provinces = getOdaConfig(env).provinces;
  }

  return {
    q,
    provinces,
    limit,
    containerId: url.searchParams.get('containerId') || undefined,
    cursor: url.searchParams.get('cursor') || undefined,
    locationBias: parsePoint(url.searchParams.get('locationBias')),
    locationRestriction: parseBbox(url.searchParams.get('locationRestriction')),
  };
}

/** `lat,lon` */
function parsePoint(value: string | null): { lat: number; lon: number } | undefined {
  if (!value) return undefined;
  const parts = value.split(',').map((v) => parseFloat(v.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
    throw new SuggestError('locationBias must be "lat,lon"', 'INVALID_QUERY', 400);
  }
  return { lat: parts[0], lon: parts[1] };
}

/** `minLat,minLon,maxLat,maxLon` */
function parseBbox(
  value: string | null
): { minLat: number; minLon: number; maxLat: number; maxLon: number } | undefined {
  if (!value) return undefined;
  const parts = value.split(',').map((v) => parseFloat(v.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new SuggestError(
      'locationRestriction must be "minLat,minLon,maxLat,maxLon"',
      'INVALID_QUERY',
      400
    );
  }
  return { minLat: parts[0], minLon: parts[1], maxLat: parts[2], maxLon: parts[3] };
}

function secondsUntilUtcMidnight(nowMs: number = Date.now()): number {
  const next = Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate() + 1
  );
  return Math.max(1, Math.ceil((next - nowMs) / 1000));
}

function suggestErrorResponse(
  error: unknown,
  correlationId: string,
  corsHeaders: Record<string, string>
): Response {
  const { message, code, status } =
    error instanceof SuggestError
      ? { message: error.message, code: error.code, status: error.status }
      : {
          message: error instanceof Error ? error.message : 'Address search failed',
          code: 'SEARCH_ERROR',
          status: 500,
        };

  return new Response(JSON.stringify({ error: message, code, correlationId }), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8', ...corsHeaders },
  });
}

export async function resolveNormalizedAddress(
  env: Env,
  lat: number,
  lon: number,
  qp: QueryParams,
  request?: Request,
  circuitBreaker?: { execute: (key: string, fn: () => Promise<unknown>) => Promise<unknown> }
): Promise<{ normalizedAddress?: string; addressComponents?: GoogleAddressComponents; mailingAddress?: CanadaPostStyleAddress } | undefined> {
  if (isOdaEnabled(env)) {
    try {
      const result = await reverseGeocodeWithOda(env, lat, lon);
      return {
        normalizedAddress: result.normalizedAddress,
        addressComponents: result.addressComponents as GoogleAddressComponents,
        mailingAddress: result.mailingAddress,
      };
    } catch {
      if (qp.address || qp.postal || qp.city) {
        try {
          const result = await geocodeWithOda(env, qp);
          return {
            normalizedAddress: result.normalizedAddress,
            addressComponents: result.addressComponents as GoogleAddressComponents,
            mailingAddress: result.mailingAddress,
          };
        } catch {
          return undefined;
        }
      }
      return undefined;
    }
  }

  const googleResult = await normalizeAddressWithGoogle(env, lat, lon, request, circuitBreaker);
  if (!googleResult) return undefined;
  return {
    normalizedAddress: googleResult.formattedAddress,
    addressComponents: googleResult.components,
  };
}
