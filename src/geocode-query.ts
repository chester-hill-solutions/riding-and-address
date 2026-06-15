import { OdaGeocodeMethod, QueryParams } from './types';

export type GeocodeMethodParam = 'auto' | 'postal_centroid';

const VALID_GEOCODE_METHODS: GeocodeMethodParam[] = ['auto', 'postal_centroid'];

export function parseGeocodeMethodParam(raw: string | undefined): {
  valid: boolean;
  value?: GeocodeMethodParam;
  error?: string;
} {
  if (raw === undefined || raw === '') {
    return { valid: true, value: 'auto' };
  }
  const normalized = raw.toLowerCase().trim() as GeocodeMethodParam;
  if (!VALID_GEOCODE_METHODS.includes(normalized)) {
    return {
      valid: false,
      error: `Invalid geocode_method. Allowed: ${VALID_GEOCODE_METHODS.join(', ')}`,
    };
  }
  return { valid: true, value: normalized };
}

/** Query has a postal code and no street address. */
export function isPostalOnlyQuery(qp: QueryParams): boolean {
  return !!qp.postal && !qp.address;
}

/** Restrict geocoding to ODA postal centroid lookup (OpenNorth parity mode). */
export function wantsPostalCentroidOnly(qp: QueryParams): boolean {
  return qp.geocodeMethod === 'postal_centroid' && !!qp.postal;
}

export function geocodeMetadataFromResult(result: {
  geocodeMethod?: OdaGeocodeMethod;
  confidence?: number;
  distanceMeters?: number;
  matchedFields?: string[];
}): { method: OdaGeocodeMethod; confidence?: number } | undefined {
  if (!result.geocodeMethod) return undefined;
  return {
    method: result.geocodeMethod,
    confidence: result.confidence,
  };
}
