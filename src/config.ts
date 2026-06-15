/// <reference types="@cloudflare/workers-types" />

import { Env } from './types';

// Centralized timeout configuration
export const TIMEOUT_CONFIG = {
  geocoding: 10000,      // 10 seconds for geocoding requests
  lookup: 5000,           // 5 seconds for riding lookup
  batch: 30000,          // 30 seconds for batch processing
  total: 60000,          // 60 seconds maximum total request time
  webhook: 30000         // 30 seconds for webhook delivery
};

/** Per-provider ceilings within the overall geocoding budget. */
export const GEOCODING_STAGE_TIMEOUTS = {
  oda: 3000,
  geogratis: 5000,
  fallback: 5000,
} as const;

// Retry configuration
export const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 1000,        // 1 second base delay
  maxDelay: 5000,         // 5 seconds maximum delay
  backoffMultiplier: 2,   // Exponential backoff multiplier
  jitter: true            // Add random jitter to prevent thundering herd
};

// Get timeout values from environment or use defaults
export function getTimeoutConfig(env: Env) {
  const batchTimeout = env.BATCH_TIMEOUT ? Number(env.BATCH_TIMEOUT) : undefined;
  return {
    geocoding: env.GEOCODING_TIMEOUT ?? TIMEOUT_CONFIG.geocoding,
    lookup: env.LOOKUP_TIMEOUT ?? TIMEOUT_CONFIG.lookup,
    batch: batchTimeout ?? TIMEOUT_CONFIG.batch,
    total: env.TOTAL_TIMEOUT ?? TIMEOUT_CONFIG.total,
    webhook: TIMEOUT_CONFIG.webhook,
    stages: { ...GEOCODING_STAGE_TIMEOUTS },
  };
}

// Get retry configuration (can be overridden by env in future)
export function getRetryConfig() {
  return RETRY_CONFIG;
}

// Time constants (in milliseconds)
export const TIME_CONSTANTS = {
  ONE_HOUR_MS: 60 * 60 * 1000,
  SIX_HOURS_MS: 6 * 60 * 60 * 1000,
  TWENTY_FOUR_HOURS_MS: 24 * 60 * 60 * 1000,
  SEVEN_DAYS_MS: 7 * 24 * 60 * 60 * 1000
};

// Time constants (in seconds for TTL)
export const TIME_CONSTANTS_SECONDS = {
  TWENTY_FOUR_HOURS: 24 * 60 * 60
};

// Quality thresholds
export const QUALITY_THRESHOLDS = {
  GEOGRATIS_MIN_SCORE: 0.5 // Minimum acceptable GeoGratis quality score (0-1 scale)
};

