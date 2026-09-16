import { incrementMetric, updateOdaD1QueriesMaxPerRequest } from './metrics';

/**
 * Counts the D1 reads a single ODA request makes.
 *
 * The counter used to live in module scope (`let requestQueryCount`), which made it
 * isolate-scoped rather than request-scoped: two requests interleaving across an `await`
 * shared one count, and whichever called `end()` first snapshotted the other's reads and
 * cleared the tracking flag. A tracker is created per request and threaded explicitly
 * through the ODA call chain, so concurrent requests cannot observe each other.
 *
 * The only global side effect is `updateOdaD1QueriesMaxPerRequest`, the 24h-window maximum.
 */
export interface OdaD1Tracker {
  /** Count one D1 read for this request and increment the global `odaD1Reads` metric. */
  record(): void;
  /** Stop tracking, publish the request count to the 24h maximum, and return the count. */
  end(): number;
  /** Reads recorded for this request so far. Does not stop tracking. */
  count(): number;
}

export function createOdaD1Tracker(): OdaD1Tracker {
  let requestQueryCount = 0;
  let trackingEnabled = true;

  return {
    record(): void {
      incrementMetric('odaD1Reads');
      if (trackingEnabled) {
        requestQueryCount++;
      }
    },
    end(): number {
      const count = requestQueryCount;
      trackingEnabled = false;
      updateOdaD1QueriesMaxPerRequest(count);
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
    incrementMetric('odaD1Reads');
  }
}

export function endOdaD1QueryTracking(): number {
  fallbackTracking = false;
  return fallbackTracker.end();
}

export function getOdaD1QueryCountForRequest(): number {
  return fallbackTracker.count();
}
