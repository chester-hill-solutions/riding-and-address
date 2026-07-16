import { Env } from './types';

export const ODA_DEFAULTS = {
  MIN_CONFIDENCE: 0.6,
  NN_MAX_CANDIDATES: 50,
  MAX_REVERSE_DISTANCE_METERS: 25000,
  MAX_AMBIGUOUS_MATCHES: 5,
  MAX_POSTAL_CENTROID_DISTANCE_METERS: 5000,
  IMPORT_BATCH_SIZE: 500,
  DATA_VERSION: '2021001',
  PROVIDER: 'statcan-oda' as const,
};

export const CONFIDENCE_BY_METHOD = {
  exact: 1.0,
  postal_centroid: 0.85,
  street_interpolated: 0.75,
  city_centroid: 0.45,
  nearest_neighbor: 0.7,
} as const;

export type OdaGeocodeMethod = keyof typeof CONFIDENCE_BY_METHOD;

export const ODA_SUGGEST_DEFAULTS = {
  /** Canada Post's MaxSuggestions default. */
  LIMIT: 7,
  MAX_LIMIT: 20,
  /** Below this, return an empty cacheable 200 rather than burning a query. Also the point
   *  where FTS5 prefix='2 3 4' stops having a prefix index and would force a full-term scan. */
  MIN_QUERY_LENGTH: 3,
  /** Rows pulled from FTS before scoring. Province filtering happens in SQL, so this window
   *  is only starved when no province hint is supplied. */
  CANDIDATE_WINDOW: 50,
  CACHE_TTL_SECONDS: 3600,
  /** Leaf resolution is capped: only the top few containers get an oda_addresses query. */
  MAX_LEAF_LOOKUPS: 3,
};

/** Ranking weights. Sum to 1.0. */
export const SUGGEST_WEIGHTS = {
  prefixQuality: 0.4,
  bm25: 0.25,
  popularity: 0.2,
  proximity: 0.1,
  civicInRange: 0.05,
} as const;

export interface OdaSuggestConfig {
  enabled: boolean;
  limit: number;
  maxLimit: number;
  minQueryLength: number;
  candidateWindow: number;
  cacheTtlSeconds: number;
}

export function getOdaSuggestConfig(env: Env): OdaSuggestConfig {
  return {
    enabled: env.ODA_SUGGEST_ENABLED === 'true' || env.ODA_SUGGEST_ENABLED === '1',
    limit: parseInt(env.ODA_SUGGEST_LIMIT || '', 10) || ODA_SUGGEST_DEFAULTS.LIMIT,
    maxLimit: parseInt(env.ODA_SUGGEST_MAX_LIMIT || '', 10) || ODA_SUGGEST_DEFAULTS.MAX_LIMIT,
    minQueryLength:
      parseInt(env.ODA_SUGGEST_MIN_QUERY_LENGTH || '', 10) || ODA_SUGGEST_DEFAULTS.MIN_QUERY_LENGTH,
    candidateWindow:
      parseInt(env.ODA_SUGGEST_CANDIDATE_WINDOW || '', 10) || ODA_SUGGEST_DEFAULTS.CANDIDATE_WINDOW,
    cacheTtlSeconds:
      parseInt(env.ODA_SUGGEST_CACHE_TTL || '', 10) || ODA_SUGGEST_DEFAULTS.CACHE_TTL_SECONDS,
  };
}

/**
 * Autocomplete only needs the suggest tables + ODA_DB — deliberately independent of
 * isOdaEnabled, so search can run whether or not the geocoding cascade is turned on.
 */
export function isOdaSuggestEnabled(env: Env): boolean {
  return getOdaSuggestConfig(env).enabled && !!env.ODA_DB;
}

export interface OdaConfig {
  enabled: boolean;
  provinces: string[];
  minConfidence: number;
  nnMaxCandidates: number;
  maxReverseDistanceMeters: number;
  maxAmbiguousMatches: number;
  maxPostalCentroidDistanceMeters: number;
  dataVersion: string;
}

export function getOdaConfig(env: Env): OdaConfig {
  const enabled =
    env.ODA_GEOCODING_ENABLED === 'true' || env.ODA_GEOCODING_ENABLED === '1';
  const provinces = (env.ODA_PROVINCES || 'ON,QC')
    .split(',')
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);

  return {
    enabled,
    provinces,
    minConfidence: parseFloat(env.ODA_MIN_CONFIDENCE || '') || ODA_DEFAULTS.MIN_CONFIDENCE,
    nnMaxCandidates: parseInt(env.ODA_NN_MAX_CANDIDATES || '', 10) || ODA_DEFAULTS.NN_MAX_CANDIDATES,
    maxReverseDistanceMeters:
      parseInt(env.ODA_MAX_REVERSE_DISTANCE_METERS || '', 10) ||
      ODA_DEFAULTS.MAX_REVERSE_DISTANCE_METERS,
    maxAmbiguousMatches:
      parseInt(env.ODA_MAX_AMBIGUOUS_MATCHES || '', 10) || ODA_DEFAULTS.MAX_AMBIGUOUS_MATCHES,
    maxPostalCentroidDistanceMeters:
      parseInt(env.ODA_MAX_POSTAL_CENTROID_DISTANCE_METERS || '', 10) ||
      ODA_DEFAULTS.MAX_POSTAL_CENTROID_DISTANCE_METERS,
    dataVersion: ODA_DEFAULTS.DATA_VERSION,
  };
}

export function isOdaEnabled(env: Env): boolean {
  return getOdaConfig(env).enabled && !!env.ODA_DB;
}
