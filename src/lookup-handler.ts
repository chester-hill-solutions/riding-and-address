import { Env, CircuitBreakerExecuteOptions } from './types';
import { geocodeIfNeeded } from './geocoding';
import { geocodingCircuitBreaker } from './circuit-breaker';
import { incrementMetric, recordTiming } from './metrics';
import { parseQuery, badRequest } from './utils';
import { getTimeoutConfig } from './config';
import {
  performExpandedLookup,
  expandedLookupResponseFields,
  type LookupRidingFn,
} from './lookup-expansion';
import { resolveLookupPath } from './return-selector';
import { BillableAuthContext, recordSuccessfulBillable } from './billing';
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

export async function handleLookupRequest(
  request: Request,
  env: Env,
  pathname: string,
  lookupRiding: LookupRidingFn,
  correlationId: string,
  startTime: number,
  getCorsHeaders: (origin?: string | null) => Record<string, string>,
  ctx?: ExecutionContext,
  billing?: BillableAuthContext | null
): Promise<Response> {
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
  const circuitBreaker = geocodingCircuitBreaker
    ? {
        execute: (key: string, fn: () => Promise<unknown>, options?: CircuitBreakerExecuteOptions) =>
          geocodingCircuitBreaker!.execute(key, fn, options),
      }
    : undefined;

  const deferTask = ctx
    ? (task: Promise<unknown>) => {
        ctx.waitUntil(task);
      }
    : undefined;

  try {
    const expanded = await performExpandedLookup(env, lookupPathname, sanitizedQuery, lookupRiding, {
      request,
      circuitBreaker,
      geocodeIfNeeded: (env, query, req, cb) =>
        geocodeIfNeeded(env, query, req, undefined, cb, deferTask),
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
    console.error(`[${correlationId}] Lookup error:`, error);
    return badRequest(
      error instanceof Error ? error.message : 'Lookup failed',
      500,
      'LOOKUP_ERROR',
      correlationId
    );
  }
}
