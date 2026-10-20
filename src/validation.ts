import { z } from 'zod';
import type { BatchLookupRequest } from './types';
import { parseGeocodeMethodParam } from './geocode-query';
import { parseReturnSelector, parseIncludeProvince, resolveIncludeProvince } from './return-selector';

/**
 * Runtime type validation schemas for external API responses.
 * Used to validate and parse responses from geocoding providers and other external services.
 */

// GeoGratis API response schemas
const GeoGratisGeometrySchema = z.object({
  type: z.string(),
  coordinates: z.array(z.number())
});

const GeoGratisResultSchema = z.object({
  title: z.string().optional(),
  qualifier: z.string().optional(),
  type: z.string().optional(),
  geometry: GeoGratisGeometrySchema,
  bbox: z.array(z.number()).optional(),
  score: z.number().min(0).max(1).optional(),
  component: z.record(z.string(), z.any()).optional()
});

const GeoGratisResponseSchema = z.array(GeoGratisResultSchema);

// Google Geocoding API response schemas
const GoogleLocationSchema = z.object({
  lat: z.number(),
  lng: z.number()
});

const GoogleGeometrySchema = z.object({
  location: GoogleLocationSchema,
  location_type: z.string().optional(),
  viewport: z.object({
    northeast: GoogleLocationSchema,
    southwest: GoogleLocationSchema
  }).optional()
});

const GoogleGeocodeResultSchema = z.object({
  address_components: z.array(z.any()).optional(),
  formatted_address: z.string().optional(),
  geometry: GoogleGeometrySchema,
  place_id: z.string().optional(),
  types: z.array(z.string()).optional()
});

const GoogleGeocodeResponseSchema = z.object({
  results: z.array(GoogleGeocodeResultSchema),
  status: z.enum(['OK', 'ZERO_RESULTS', 'OVER_QUERY_LIMIT', 'REQUEST_DENIED', 'INVALID_REQUEST', 'UNKNOWN_ERROR'])
});

// Nominatim (OpenStreetMap) API response schemas
const NominatimResultSchema = z.object({
  place_id: z.number().optional(),
  licence: z.string().optional(),
  osm_type: z.string().optional(),
  osm_id: z.number().optional(),
  boundingbox: z.array(z.string()).optional(),
  lat: z.string(),
  lon: z.string(),
  display_name: z.string().optional(),
  class: z.string().optional(),
  type: z.string().optional(),
  importance: z.number().optional(),
  icon: z.string().optional()
});

const NominatimResponseSchema = z.array(NominatimResultSchema);

// Mapbox Geocoding API response schemas
const MapboxFeatureSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  place_type: z.array(z.string()).optional(),
  relevance: z.number().optional(),
  properties: z.record(z.string(), z.any()).optional(),
  text: z.string().optional(),
  place_name: z.string().optional(),
  center: z.tuple([z.number(), z.number()]),
  geometry: z.any().optional()
});

const MapboxResponseSchema = z.object({
  type: z.literal('FeatureCollection'),
  query: z.array(z.any()).optional(),
  features: z.array(MapboxFeatureSchema),
  attribution: z.string().optional()
});

/**
 * Safe validation wrapper for GeoGratis responses.
 */
export function safeValidateGeoGratis(data: unknown) {
  return safeValidate(GeoGratisResponseSchema, data);
}

/**
 * Safe validation wrapper for Google Geocoding responses.
 */
export function safeValidateGoogleGeocode(data: unknown) {
  return safeValidate(GoogleGeocodeResponseSchema, data);
}

/**
 * Safe validation wrapper for Nominatim responses.
 */
export function safeValidateNominatim(data: unknown) {
  return safeValidate(NominatimResponseSchema, data);
}

/**
 * Safe validation wrapper for Mapbox responses.
 */
export function safeValidateMapbox(data: unknown) {
  return safeValidate(MapboxResponseSchema, data);
}

/**
 * Safe validation wrapper that returns a result instead of throwing.
 * Useful for error handling when validation failures should be handled gracefully.
 */
function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}

const QueryParamsSchema = z.object({
  address: z.string().optional(),
  postal: z.string().optional(),
  lat: z.number().finite().optional(),
  lon: z.number().finite().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  return: z.string().optional(),
  include_province: z.string().optional(),
  geocode_method: z.string().optional(),
}).refine(
  (query) =>
    (query.lat !== undefined && query.lon !== undefined) ||
    !!query.postal ||
    !!query.address,
  { message: 'query must include lat/lon, postal, or address' }
);

const BatchLookupRequestSchema = z.object({
  id: z.string().min(1),
  query: QueryParamsSchema,
  pathname: z.string().regex(/^\/api/),
});

const BatchLookupRequestsSchema = z.array(BatchLookupRequestSchema).min(1).max(100);

export function parseBatchLookupRequests(data: unknown): BatchLookupRequest[] {
  const parsed = BatchLookupRequestsSchema.parse(data) as BatchLookupRequest[];
  return enrichBatchLookupRequests(parsed);
}

function enrichBatchLookupRequests(requests: BatchLookupRequest[]): BatchLookupRequest[] {
  return requests.map((request) => {
    let returnFields = request.query.returnFields;
    let includeProvince = request.query.includeProvince;
    let geocodeMethod = request.query.geocodeMethod;

    if (request.query.return !== undefined) {
      const returnParse = parseReturnSelector(request.query.return);
      if (!returnParse.valid) {
        throw new z.ZodError([
          {
            code: 'custom',
            message: returnParse.error ?? 'Invalid return selector',
            path: ['query', 'return'],
          },
        ]);
      }
      returnFields = returnParse.fields;
    }

    if (request.query.include_province !== undefined) {
      const includeProvinceParse = parseIncludeProvince(request.query.include_province);
      if (!includeProvinceParse.valid) {
        throw new z.ZodError([
          {
            code: 'custom',
            message: includeProvinceParse.error ?? 'Invalid include_province flag',
            path: ['query', 'include_province'],
          },
        ]);
      }
      includeProvince = includeProvinceParse.value;
    }

    if (request.query.geocode_method !== undefined) {
      const geocodeMethodParse = parseGeocodeMethodParam(request.query.geocode_method);
      if (!geocodeMethodParse.valid) {
        throw new z.ZodError([
          {
            code: 'custom',
            message: geocodeMethodParse.error ?? 'Invalid geocode_method',
            path: ['query', 'geocode_method'],
          },
        ]);
      }
      geocodeMethod = geocodeMethodParse.value;
    } else {
      geocodeMethod = geocodeMethod ?? 'auto';
    }

    const returnSelectorProvided = request.query.return !== undefined;

    return {
      ...request,
      query: {
        ...request.query,
        returnFields: returnFields ?? [],
        geocodeMethod,
        includeProvince: resolveIncludeProvince(
          request.pathname,
          includeProvince,
          returnSelectorProvided
        ),
      },
    };
  });
}

export function safeParseBatchLookupRequests(
  data: unknown
): { success: true; data: BatchLookupRequest[] } | { success: false; error: z.ZodError } {
  const result = BatchLookupRequestsSchema.safeParse(data);
  if (result.success) {
    try {
      return {
        success: true,
        data: enrichBatchLookupRequests(result.data as BatchLookupRequest[]),
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error };
      }
      throw error;
    }
  }
  return { success: false, error: result.error };
}

