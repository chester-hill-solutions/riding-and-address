import { incrementMetric, updateOdaD1QueriesMaxPerRequest } from './metrics';

let requestQueryCount = 0;
let trackingEnabled = false;

export function beginOdaD1QueryTracking(): void {
  requestQueryCount = 0;
  trackingEnabled = true;
}

export function recordOdaD1Query(): void {
  incrementMetric('odaD1Reads');
  if (trackingEnabled) {
    requestQueryCount++;
  }
}

export function endOdaD1QueryTracking(): number {
  const count = requestQueryCount;
  trackingEnabled = false;
  if (count > 0) {
    updateOdaD1QueriesMaxPerRequest(count);
  }
  return count;
}

export function getOdaD1QueryCountForRequest(): number {
  return requestQueryCount;
}
