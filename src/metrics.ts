import { Metrics, OdaGeocodeMethod } from './types';
import { TIME_CONSTANTS } from './config';

// Metrics window configuration (24 hours)
const METRICS_RESET_INTERVAL_MS = TIME_CONSTANTS.TWENTY_FOUR_HOURS_MS;

/**
 * One injectable sink for every metric write.
 *
 * The module-global sink (`metricsSink`) is the default, so direct callers are unchanged.
 * Passing a sink lets a single run be observed in isolation: every counter and timing the
 * run emits lands on that sink and the module global stays untouched. The request-scoped
 * maximum is optional so a lightweight spy can implement only the two counter methods.
 */
export interface MetricsSink {
  incrementMetric(key: keyof Metrics, value?: number): void;
  recordTiming(key: keyof Metrics, duration: number): void;
  updateOdaD1QueriesMaxPerRequest?(count: number): void;
}

/**
 * Registration maps: the single source of truth for the geocoding-fallback counters and the
 * labels `getMetricsSummary` reports them under. Adding a metric means editing one map here,
 * not re-listing keys in the summary.
 */

/** Local-resolution method -> its counter. Keys double as the summary labels. */
export const ODA_METHOD_METRIC: Record<OdaGeocodeMethod, keyof Metrics> = {
  exact: 'geocodingOdaMethodExact',
  postal_street: 'geocodingOdaMethodPostalStreet',
  postal_centroid: 'geocodingOdaMethodPostalCentroid',
  street_interpolated: 'geocodingOdaMethodStreetInterpolated',
  city_centroid: 'geocodingOdaMethodCityCentroid',
  nearest_neighbor: 'geocodingOdaMethodNearest',
};

/** ODA contract code -> the miss counter it increments and the label it reports under. */
export const ODA_MISS_METRIC: Record<string, { metric: keyof Metrics; label: string }> = {
  ADDRESS_NOT_FOUND: { metric: 'geocodingOdaMissNotFound', label: 'not_found' },
  AMBIGUOUS_LOCATION: { metric: 'geocodingOdaMissAmbiguous', label: 'ambiguous' },
  PROVINCE_NOT_LOADED: { metric: 'geocodingOdaMissProvinceNotLoaded', label: 'province_not_loaded' },
  LOW_CONFIDENCE_GEOCODE: { metric: 'geocodingOdaMissLowConfidence', label: 'low_confidence' },
  OTHER: { metric: 'geocodingOdaMissOther', label: 'other' },
};

/** Provider name -> its call counter. Keys double as the summary labels. */
export const EXTERNAL_PROVIDER_METRIC: Record<string, keyof Metrics> = {
  geogratis: 'geocodingExternalGeogratis',
  google: 'geocodingExternalGoogle',
  mapbox: 'geocodingExternalMapbox',
  nominatim: 'geocodingExternalNominatim',
};

/** The miss counter for an ODA contract code, falling back to the catch-all `other`. */
export function odaMissMetricFor(code: string): keyof Metrics {
  return (ODA_MISS_METRIC[code] ?? ODA_MISS_METRIC.OTHER).metric;
}

// Track when metrics were last reset
let lastResetTime = Date.now();

// Global metrics object
const metrics: Metrics = {
  geocodingRequests: 0,
  geocodingCacheHits: 0,
  geocodingCacheMisses: 0,
  geocodingErrors: 0,
  geocodingSuccesses: 0,
  geocodingFailures: 0,
  geocodingCircuitBreakerTrips: 0,
  r2Requests: 0,
  r2CacheHits: 0,
  r2CacheMisses: 0,
  r2Errors: 0,
  r2Successes: 0,
  r2Failures: 0,
  r2CircuitBreakerTrips: 0,
  spatialIndexHits: 0,
  spatialIndexMisses: 0,
  totalSpatialIndexTime: 0,
  lookupRequests: 0,
  suggestRequests: 0,
  suggestCacheHits: 0,
  suggestCacheMisses: 0,
  suggestErrors: 0,
  suggestEmptyResults: 0,
  suggestKeyDenials: 0,
  totalSuggestTime: 0,
  lookupCacheHits: 0,
  lookupCacheMisses: 0,
  lookupErrors: 0,
  batchRequests: 0,
  batchErrors: 0,
  webhookDeliveries: 0,
  webhookFailures: 0,
  requestCount: 0,
  errorCount: 0,
  totalLookupTime: 0,
  totalGeocodingTime: 0,
  geocodingOdaTime: 0,
  geocodingGeoGratisTime: 0,
  geocodingFallbackTime: 0,
  odaD1Reads: 0,
  odaD1QueriesMaxPerRequest: 0,
  odaStageTimeouts: 0,
  geocodingOdaMethodExact: 0,
  geocodingOdaMethodPostalStreet: 0,
  geocodingOdaMethodPostalCentroid: 0,
  geocodingOdaMethodStreetInterpolated: 0,
  geocodingOdaMethodCityCentroid: 0,
  geocodingOdaMethodNearest: 0,
  geocodingOdaMissNotFound: 0,
  geocodingOdaMissAmbiguous: 0,
  geocodingOdaMissProvinceNotLoaded: 0,
  geocodingOdaMissLowConfidence: 0,
  geocodingOdaMissOther: 0,
  geocodingExternalCalls: 0,
  geocodingExternalGeogratis: 0,
  geocodingExternalGoogle: 0,
  geocodingExternalMapbox: 0,
  geocodingExternalNominatim: 0,
  totalR2Time: 0,
  totalBatchTime: 0,
  totalWebhookTime: 0
};

/**
 * Window semantics (deliberate): the 24h window resets lazily on the next *write*.
 * `getMetrics`/`getMetricsSummary` never reset, so an idle isolate keeps serving the last
 * window's counters until a mutation arrives. The alternative — reset-on-read — would make
 * every scrape mutate shared state; this keeps the readers side-effect free. Pinned by
 * `test/metrics.test.ts` ("window resets lazily on the next write").
 */
function checkAndResetMetrics(): void {
  const now = Date.now();
  if (now - lastResetTime >= METRICS_RESET_INTERVAL_MS) {
    resetMetrics();
    lastResetTime = now;
  }
}

// Metrics helper functions
export function incrementMetric(key: keyof Metrics, value: number = 1): void {
  checkAndResetMetrics();
  metrics[key] += value;
}

export function recordTiming(key: keyof Metrics, duration: number): void {
  checkAndResetMetrics();
  metrics[key] += duration;
}

export function updateOdaD1QueriesMaxPerRequest(count: number): void {
  checkAndResetMetrics();
  if (count > metrics.odaD1QueriesMaxPerRequest) {
    metrics.odaD1QueriesMaxPerRequest = count;
  }
}

/**
 * The module-global sink: the default for every geocoding/ODA entry point that accepts a
 * `MetricsSink`. Direct callers that pass nothing keep writing here.
 */
export const metricsSink: MetricsSink = {
  incrementMetric,
  recordTiming,
  updateOdaD1QueriesMaxPerRequest,
};

export function getMetrics(): Metrics {
  return { ...metrics };
}

export function resetMetrics(): void {
  Object.keys(metrics).forEach(key => {
    metrics[key as keyof Metrics] = 0;
  });
  lastResetTime = Date.now();
}

// Get time since last reset (for metrics window calculation)
export function getMetricsAge(): number {
  return Date.now() - lastResetTime;
}

// Get a `label -> counter` snapshot of a `label -> metric key` registration map.
function labelSnapshot(registration: Record<string, keyof Metrics>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(registration).map(([label, key]) => [label, metrics[key]])
  );
}

// Get metrics summary for monitoring
export function getMetricsSummary(): {
  requests: {
    total: number;
    errors: number;
    errorRate: number;
  };
  geocoding: {
    requests: number;
    cacheHits: number;
    cacheMisses: number;
    errors: number;
    hitRate: number;
    avgTime: number;
  };
  geocodingFallback: {
    odaResolved: number;
    odaMisses: number;
    externalCalls: number;
    /** Share of resolutions (local + external) that required an external provider, as a percent. */
    fallbackRate: number;
    byMethod: Record<string, number>;
    missReasons: Record<string, number>;
    providers: Record<string, number>;
  };
  r2: {
    requests: number;
    cacheHits: number;
    cacheMisses: number;
    errors: number;
    hitRate: number;
    avgTime: number;
  };
  lookup: {
    requests: number;
    cacheHits: number;
    cacheMisses: number;
    errors: number;
    hitRate: number;
    avgTime: number;
  };
  batch: {
    requests: number;
    errors: number;
    avgTime: number;
  };
  webhooks: {
    deliveries: number;
    failures: number;
    successRate: number;
    avgTime: number;
  };
} {
  const totalRequests = metrics.requestCount;
  const totalErrors = metrics.errorCount;
  const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

  const geocodingHitRate = metrics.geocodingRequests > 0 
    ? (metrics.geocodingCacheHits / metrics.geocodingRequests) * 100 
    : 0;
  const geocodingAvgTime = metrics.geocodingRequests > 0 
    ? metrics.totalGeocodingTime / metrics.geocodingRequests 
    : 0;

  const r2HitRate = metrics.r2Requests > 0 
    ? (metrics.r2CacheHits / metrics.r2Requests) * 100 
    : 0;
  const r2AvgTime = metrics.r2Requests > 0 
    ? metrics.totalR2Time / metrics.r2Requests 
    : 0;

  const lookupHitRate = metrics.lookupRequests > 0 
    ? (metrics.lookupCacheHits / metrics.lookupRequests) * 100 
    : 0;
  const lookupAvgTime = metrics.lookupRequests > 0 
    ? metrics.totalLookupTime / metrics.lookupRequests 
    : 0;

  const batchAvgTime = metrics.batchRequests > 0 
    ? metrics.totalBatchTime / metrics.batchRequests 
    : 0;

  const webhookTotal = metrics.webhookDeliveries + metrics.webhookFailures;
  const webhookSuccessRate = webhookTotal > 0 
    ? (metrics.webhookDeliveries / webhookTotal) * 100 
    : 0;
  const webhookAvgTime = webhookTotal > 0 
    ? metrics.totalWebhookTime / webhookTotal 
    : 0;

  const odaResolved = Object.values(ODA_METHOD_METRIC).reduce(
    (sum, key) => sum + metrics[key],
    0
  );
  const odaMisses = Object.values(ODA_MISS_METRIC).reduce(
    (sum, { metric }) => sum + metrics[metric],
    0
  );
  const externalCalls = metrics.geocodingExternalCalls;
  const resolutionTotal = odaResolved + externalCalls;
  const fallbackRate = resolutionTotal > 0 ? (externalCalls / resolutionTotal) * 100 : 0;

  return {
    requests: {
      total: totalRequests,
      errors: totalErrors,
      errorRate: Math.round(errorRate * 100) / 100
    },
    geocoding: {
      requests: metrics.geocodingRequests,
      cacheHits: metrics.geocodingCacheHits,
      cacheMisses: metrics.geocodingCacheMisses,
      errors: metrics.geocodingErrors,
      hitRate: Math.round(geocodingHitRate * 100) / 100,
      avgTime: Math.round(geocodingAvgTime * 100) / 100
    },
    geocodingFallback: {
      odaResolved,
      odaMisses,
      externalCalls,
      fallbackRate: Math.round(fallbackRate * 100) / 100,
      byMethod: labelSnapshot(ODA_METHOD_METRIC),
      missReasons: Object.fromEntries(
        Object.entries(ODA_MISS_METRIC).map(([, { metric, label }]) => [label, metrics[metric]])
      ),
      providers: labelSnapshot(EXTERNAL_PROVIDER_METRIC)
    },
    r2: {
      requests: metrics.r2Requests,
      cacheHits: metrics.r2CacheHits,
      cacheMisses: metrics.r2CacheMisses,
      errors: metrics.r2Errors,
      hitRate: Math.round(r2HitRate * 100) / 100,
      avgTime: Math.round(r2AvgTime * 100) / 100
    },
    lookup: {
      requests: metrics.lookupRequests,
      cacheHits: metrics.lookupCacheHits,
      cacheMisses: metrics.lookupCacheMisses,
      errors: metrics.lookupErrors,
      hitRate: Math.round(lookupHitRate * 100) / 100,
      avgTime: Math.round(lookupAvgTime * 100) / 100
    },
    batch: {
      requests: metrics.batchRequests,
      errors: metrics.batchErrors,
      avgTime: Math.round(batchAvgTime * 100) / 100
    },
    webhooks: {
      deliveries: metrics.webhookDeliveries,
      failures: metrics.webhookFailures,
      successRate: Math.round(webhookSuccessRate * 100) / 100,
      avgTime: Math.round(webhookAvgTime * 100) / 100
    }
  };
}
