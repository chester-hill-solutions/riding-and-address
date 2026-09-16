/**
 * Operator-only gateway handlers: liveness, metrics, cache-warming status, and circuit-breaker
 * reset. Auth for every one of these runs once in `runPrelude`; the handlers only read state.
 */

import { getCacheWarmingStatus } from './cache-warming';
import { getMetrics, getMetricsSummary } from './metrics';
import {
  allRequiredDatasetsPresent,
  checkRidingDatasets,
  missingDatasetKeys,
} from './datasets';
import { geocodingCircuitBreaker, r2CircuitBreaker } from './circuit-breaker';
import { TIME_CONSTANTS } from './config';
import { jsonHeaders, type RouteContext } from './route-context';

/** `/health` — public liveness; detailed diagnostics only for a valid operator credential. */
export async function handleHealth(ctx: RouteContext): Promise<Response> {
  const headers = jsonHeaders(ctx);

  if (!ctx.isAdmin) {
    return new Response(
      JSON.stringify({ status: 'healthy', timestamp: Date.now() }),
      { headers }
    );
  }

  const metrics = getMetrics();
  const circuitBreakerStates = {
    geocodingOda: await geocodingCircuitBreaker.getStateInfo('geocoding:oda'),
    geocodingNominatim: await geocodingCircuitBreaker.getStateInfo('geocoding:nominatim'),
    r2: await r2CircuitBreaker.getStateInfo('r2:federalridings-2024.geojson'),
  };
  const datasets = await checkRidingDatasets(ctx.env);
  const datasetsOk = allRequiredDatasetsPresent(datasets);
  const missingDatasets = missingDatasetKeys(datasets);

  return new Response(
    JSON.stringify({
      status: datasetsOk ? 'healthy' : 'unhealthy',
      timestamp: Date.now(),
      metrics,
      circuitBreakers: circuitBreakerStates,
      cacheWarming: getCacheWarmingStatus(),
      datasets,
      ...(missingDatasets.length > 0 && { missingDatasets }),
    }),
    { headers }
  );
}

/** `/metrics` — operator summary; admin gate runs in `runPrelude`. */
export function handleMetrics(ctx: RouteContext): Response {
  return new Response(JSON.stringify(getMetricsSummary()), { headers: jsonHeaders(ctx) });
}

/** `/cache-warming` — last-warming status; admin gate runs in `runPrelude`. */
export function handleCacheWarming(ctx: RouteContext): Response {
  const status = getCacheWarmingStatus();
  return new Response(
    JSON.stringify({
      ...status,
      config: {
        enabled: true,
        interval: TIME_CONSTANTS.SIX_HOURS_MS,
        batchSize: 5,
      },
    }),
    { headers: jsonHeaders(ctx) }
  );
}

/** `/admin/circuit-breaker/reset` — reset one breaker (by `key`) or all of them. */
export async function handleCircuitBreakerReset(ctx: RouteContext): Promise<Response> {
  const key = ctx.url.searchParams.get('key');
  if (key) {
    if (key.startsWith('r2:')) {
      await r2CircuitBreaker.reset(key);
    } else {
      await geocodingCircuitBreaker.reset(key);
    }
    return new Response(
      JSON.stringify({ success: true, message: `Circuit breaker ${key} reset` }),
      { headers: jsonHeaders(ctx) }
    );
  }

  await geocodingCircuitBreaker.resetAll();
  return new Response(
    JSON.stringify({ success: true, message: 'All circuit breakers reset' }),
    { headers: jsonHeaders(ctx) }
  );
}
