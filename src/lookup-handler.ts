import { Env } from './types';
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

export async function handleLookupRequest(
  request: Request,
  env: Env,
  pathname: string,
  lookupRiding: LookupRidingFn,
  correlationId: string,
  startTime: number,
  getCorsHeaders: (origin?: string | null) => Record<string, string>,
  ctx?: ExecutionContext
): Promise<Response> {
  const { lookupPathname } = resolveLookupPath(pathname);
  const { validation } = parseQuery(request);

  if (!validation.valid) {
    return badRequest(validation.error || 'Invalid query parameters', 400, 'INVALID_QUERY', correlationId);
  }

  const sanitizedQuery = validation.sanitized!;
  const origin = request.headers.get('Origin');

  incrementMetric('lookupRequests');

  const timeoutConfig = getTimeoutConfig(env);
  const circuitBreaker = geocodingCircuitBreaker
    ? {
        execute: (key: string, fn: () => Promise<unknown>) =>
          geocodingCircuitBreaker!.execute(key, fn),
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
        geocodeIfNeeded(env, query, req, undefined, cb),
      geocodingTimeoutMs: timeoutConfig.geocoding,
      deferTask,
    });

    recordTiming('totalLookupTime', Date.now() - startTime);

    return new Response(
      JSON.stringify({
        query: sanitizedQuery,
        point: expanded.point,
        ...expandedLookupResponseFields(expanded),
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
