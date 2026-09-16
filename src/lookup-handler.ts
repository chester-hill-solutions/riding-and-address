import { geocodeIfNeeded } from './geocoding';
import { geocodingExecutor } from './circuit-breaker';
import { incrementMetric, recordTiming } from './metrics';
import { parseQuery, badRequest, internalErrorResponse } from './utils';
import { getTimeoutConfig } from './config';
import { performExpandedLookup, expandedLookupResponseFields } from './lookup-expansion';
import { resolveLookupPath } from './return-selector';
import { recordSuccessfulBillable } from './billing';
import { cachedLookupRiding } from './riding-lookup';
import { FEDERAL_DATASET, PROVINCIAL_DATASETS } from './datasets';
import type { RouteContext } from './routes';

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
 * The lookup handler. Auth, rate limiting and the response-header policy have already run in the
 * dispatcher prelude; this reads everything it needs — request, env, correlation id, timing, CORS,
 * defer seam and the resolved Billable Customer — from the one `RouteContext`.
 */
export async function handleLookupRequest(ctx: RouteContext): Promise<Response> {
  const { request, env, correlationId, startTime, corsHeaders, deferTask, billing } = ctx;
  const lookupRiding = ctx.lookup ?? cachedLookupRiding;
  const pathname = ctx.url.pathname;
  const { lookupPathname } = resolveLookupPath(pathname);
  const { validation } = parseQuery(request);

  if (!validation.valid) {
    return badRequest(validation.error || 'Invalid query parameters', 400, 'INVALID_QUERY', correlationId);
  }

  const sanitizedQuery = validation.sanitized!;
  const origin = request.headers.get('Origin');
  const pin = ctx.url.searchParams.get('dataset') || ctx.url.searchParams.get('pin');
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

    if (billing) {
      const billed = await recordSuccessfulBillable(env, billing, {
        waitUntil: deferTask,
      });
      if (!billed.allowed) {
        return ctx.billableDenial(billed);
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
          ...corsHeaders(origin),
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
