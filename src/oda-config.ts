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
