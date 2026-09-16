import { metricsSink, type MetricsSink } from './metrics';

/**
 * Counts the D1 reads a single ODA request makes.
 *
 * The counter used to live in module scope (`let requestQueryCount`), which made it
 * isolate-scoped rather than request-scoped: two requests interleaving across an `await`
 * shared one count, and whichever called `end()` first snapshotted the other's reads and
 * cleared the tracking flag. A tracker is created per request and threaded explicitly
 * through the ODA call chain, so concurrent requests cannot observe each other.
 *
 * Every side effect goes to the tracker's sink — the module-global sink by default, or an
 * injected one so a single run can be observed in isolation.
 */
export interface OdaD1Tracker {
  /** Count one D1 read for this request and increment `odaD1Reads` on the sink. */
  record(): void;
  /** Stop tracking, publish the request count to the sink's 24h maximum, and return the count. */
  end(): number;
  /** Reads recorded for this request so far. Does not stop tracking. */
  count(): number;
}

export function createOdaD1Tracker(sink: MetricsSink = metricsSink): OdaD1Tracker {
  let requestQueryCount = 0;
  let trackingEnabled = true;

  return {
    record(): void {
      sink.incrementMetric('odaD1Reads');
      if (trackingEnabled) {
        requestQueryCount++;
      }
    },
    end(): number {
      const count = requestQueryCount;
      trackingEnabled = false;
      sink.updateOdaD1QueriesMaxPerRequest?.(count);
      return count;
    },
    count(): number {
      return requestQueryCount;
    },
  };
}

/**
 * Per-isolate fallback for direct callers that do not thread a tracker, and for the
 * legacy begin/record/end helpers. Request isolation requires passing a tracker into the
 * ODA entry points; this instance only keeps serial, single-request callers working.
 */
let fallbackTracker = createOdaD1Tracker();
let fallbackTracking = false;

export function beginOdaD1QueryTracking(): void {
  fallbackTracker = createOdaD1Tracker();
  fallbackTracking = true;
}

export function recordOdaD1Query(): void {
  if (fallbackTracking) {
    fallbackTracker.record();
  } else {
    // No request tracker is active: count the read globally without attributing it to a
    // request. Paths that are not request-bracketed (postal-centroid, reverse) land here.
    metricsSink.incrementMetric('odaD1Reads');
  }
}

export function endOdaD1QueryTracking(): number {
  fallbackTracking = false;
  return fallbackTracker.end();
}

export function getOdaD1QueryCountForRequest(): number {
  return fallbackTracker.count();
}
