import { Env, DeferTaskFn } from './types';
import { geocodeIfNeeded } from './geocoding';
import { geocodingExecutor } from './circuit-breaker';
import { incrementMetric, recordTiming } from './metrics';
import { resolveCorsOrigin, securityHeaders } from './http-headers';
import { parseQuery, badRequest, internalErrorResponse } from './utils';
import { getTimeoutConfig } from './config';
import {
  performExpandedLookup,
  expandedLookupResponseFields,
  type LookupRidingFn,
} from './lookup-expansion';
import { resolveLookupPath } from './return-selector';
import { BillableAuthContext, recordSuccessfulBillable } from './billing';
import { cachedLookupRiding } from './riding-lookup';
import { FEDERAL_DATASET, PROVINCIAL_DATASETS } from './datasets';

function datasetMetaForPath(pathname: string): { id: string; year: number; name: string } {
  if (pathname === '/api' || pathname === '/api/federal' || pathname === '/api/combined') {
    return { id: FEDERAL_DATASET.r2Key, year: FEDERAL_DATASET.year, name: FEDERAL_DATASET.name };
  }
  const provincial = PROVINCIAL_DATASETS.find((d) => d.path === pathname);
  if (provincial) {
    return { id: provincial.r2Key, year: provincial.year, name: provincial.name };
  }
  return { id: FEDERAL_DATASET.r2Key, year: FEDERAL_DATASET.year, name: FEDERAL_DATASET.name };
}

/**
 * Per-request environment assembled once in the Worker fetch handler.
 * Handlers take this instead of threading env/correlationId/timing/CORS/defer
 * individually — the interface is one object, not five parameters.
 */
export type LookupRequestScope = {
  env: Env;
  correlationId: string;
  startTime: number;
  corsHeaders: (origin?: string | null) => Record<string, string>;
  deferTask?: DeferTaskFn;
  /** Test seam: override the riding lookup. Production uses the cached core. */
  lookup?: LookupRidingFn;
};

export function createLookupRequestScope(
  env: Env,
  request: Request,
  ctx: ExecutionContext | undefined,
  correlationId: string,
  startTime: number
): LookupRequestScope {
  return {
    env,
    correlationId,
    startTime,
    corsHeaders: (origin?: string | null) => {
      const cors = resolveCorsOrigin(env, origin);
      return {
        'Access-Control-Allow-Origin': cors.allowOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'Content-Type, Authorization, X-Api-Key, X-Google-API-Key, X-Correlation-ID, X-Request-ID',
        'Access-Control-Max-Age': '86400',
        // Credentials only for an origin explicitly matched against the configured allowlist.
        ...(cors.allowCredentials ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
        'X-Correlation-ID': correlationId,
        ...securityHeaders(),
      };
    },
    deferTask: ctx ? (task: Promise<unknown>) => { ctx.waitUntil(task); } : undefined,
  };
}

export async function handleLookupRequest(
  scope: LookupRequestScope,
  request: Request,
  pathname: string,
  billing?: BillableAuthContext | null
): Promise<Response> {
  const { env, correlationId, startTime, corsHeaders: getCorsHeaders, deferTask } = scope;
  const lookupRiding = scope.lookup ?? cachedLookupRiding;
  const { lookupPathname } = resolveLookupPath(pathname);
  const { validation } = parseQuery(request);

  if (!validation.valid) {
    return badRequest(validation.error || 'Invalid query parameters', 400, 'INVALID_QUERY', correlationId);
  }

  const sanitizedQuery = validation.sanitized!;
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const pin = url.searchParams.get('dataset') || url.searchParams.get('pin');
  const datasetMeta = datasetMetaForPath(lookupPathname);

  if (pin && pin !== datasetMeta.id && pin !== String(datasetMeta.year)) {
    // Sparse history: only current vintage is served unless pin matches it.
    return badRequest(
      `Dataset '${pin}' is not available`,
      404,
      'DATASET_UNAVAILABLE',
      correlationId
    );
  }

  incrementMetric('lookupRequests');

  const timeoutConfig = getTimeoutConfig(env);
  const circuitBreaker = geocodingExecutor();

  try {
    const expanded = await performExpandedLookup(env, lookupPathname, sanitizedQuery, lookupRiding, {
      request,
      circuitBreaker,
      geocodeIfNeeded: (env, query, opts) =>
        geocodeIfNeeded(env, query, { ...opts, deferTask }),
      geocodingTimeoutMs: timeoutConfig.geocoding,
      deferTask,
    });

    recordTiming('totalLookupTime', Date.now() - startTime);

    if (billing?.customer && billing.key) {
      const billed = await recordSuccessfulBillable(env, billing, {
        waitUntil: deferTask,
      });
      if (!billed.allowed) {
        return new Response(JSON.stringify({ ...billed.body, correlationId }), {
          status: billed.status,
          headers: {
            'content-type': 'application/json; charset=UTF-8',
            ...getCorsHeaders(origin),
          },
        });
      }
    }

    return new Response(
      JSON.stringify({
        query: sanitizedQuery,
        point: expanded.point,
        ...expandedLookupResponseFields(expanded),
        dataset: datasetMeta,
        correlationId,
      }),
      {
        headers: {
          'content-type': 'application/json; charset=UTF-8',
          'X-Cache-Status': expanded.cacheStatus,
          ...getCorsHeaders(origin),
        },
      }
    );
  } catch (error) {
    incrementMetric('errorCount');
    // 5xx bodies stay generic: geocoder/R2/internal messages are logged with the correlation ID
    // instead of being sent to the client.
    return internalErrorResponse(error, 'Lookup error', correlationId, 'LOOKUP_ERROR');
  }
}
