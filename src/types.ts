/// <reference types="@cloudflare/workers-types" />

export interface Env {
  RIDINGS: R2Bucket;
  GEOCODER?: string;
  MAPBOX_TOKEN?: string;
  GOOGLE_MAPS_KEY?: string;
  BASIC_AUTH?: string;
  BATCH_QUEUE?: DurableObjectNamespace;
  QUEUE_MANAGER?: DurableObjectNamespace;
  CIRCUIT_BREAKER_DO?: DurableObjectNamespace;
  BATCH_SIZE?: number;
  BATCH_TIMEOUT?: number;
  GEOCODING_TIMEOUT?: number;
  LOOKUP_TIMEOUT?: number;
  TOTAL_TIMEOUT?: number;
  RATE_LIMIT?: number;
  GEOCODING_CACHE?: KVNamespace;
  LOOKUP_CACHE?: KVNamespace;
  WEBHOOKS?: KVNamespace;
  RIDING_DB?: D1Database;
  SPATIAL_DB_ENABLED?: string; // 'true' or '1' to enable spatial database
  ODA_DB?: D1Database;
  ODA_GEOCODING_ENABLED?: string;
  ODA_PROVINCES?: string;
  ODA_MIN_CONFIDENCE?: string;
  ODA_NN_MAX_CANDIDATES?: string;
  ODA_MAX_REVERSE_DISTANCE_METERS?: string;
  ODA_MAX_AMBIGUOUS_MATCHES?: string;
}

// ODA geocoding types
export interface CanadaPostStyleAddress {
  line1: string;
  line2?: string;
  municipality: string;
  province: string;
  postalCode?: string;
  country: 'CANADA';
  formattedSingleLine: string;
  formattedMultiline: string;
  canadaPostCertified: false;
}

export interface OdaAddressComponents {
  civic_number?: string;
  street_name?: string;
  street_type?: string;
  street_direction?: string;
  unit?: string;
  locality?: string;
  administrative_area_level_1?: string;
  postal_code?: string;
  country?: string;
  formatted_address?: string;
}

export interface OdaDataSource {
  provider: 'statcan-oda';
  version: string;
  province: string;
  canadaPostCertified: false;
}

export type OdaGeocodeMethod =
  | 'exact'
  | 'postal_centroid'
  | 'street_interpolated'
  | 'city_centroid'
  | 'nearest_neighbor';

export interface OdaGeocodeMetadata {
  geocodeMethod?: OdaGeocodeMethod;
  confidence?: number;
  distanceMeters?: number;
  matchedFields?: string[];
  mailingAddress?: CanadaPostStyleAddress;
  dataSource?: OdaDataSource;
}

// Geocoding interfaces
export interface MapboxFeature {
  center: [number, number];
}

export interface MapboxResponse {
  features: MapboxFeature[];
}

export interface NominatimResult {
  lon: string;
  lat: string;
}

export interface GoogleGeocodeLocation { 
  lat: number; 
  lng: number; 
}

export interface GoogleGeocodeGeometry { 
  location: GoogleGeocodeLocation; 
}

export interface GoogleGeocodeResult { 
  geometry: GoogleGeocodeGeometry; 
}

export interface GoogleGeocodeResponse { 
  status: string; 
  results: GoogleGeocodeResult[]; 
}

// Google Address Components - structured breakdown of address parts
export interface GoogleAddressComponents {
  street_number?: string;
  route?: string; // Street name
  subpremise?: string; // Apartment, suite, etc.
  locality?: string; // City
  administrative_area_level_1?: string; // State/Province
  administrative_area_level_2?: string; // County
  administrative_area_level_3?: string;
  administrative_area_level_4?: string;
  administrative_area_level_5?: string;
  country?: string;
  postal_code?: string;
  postal_code_suffix?: string;
  neighborhood?: string;
  sublocality?: string;
  sublocality_level_1?: string;
  sublocality_level_2?: string;
  sublocality_level_3?: string;
  sublocality_level_4?: string;
  sublocality_level_5?: string;
  premise?: string; // Building name
  establishment?: string;
  point_of_interest?: string;
  park?: string;
  street_address?: string;
  intersection?: string;
  political?: string;
  colloquial_area?: string;
  ward?: string;
  // Additional fields from Google response
  formatted_address?: string;
  place_id?: string;
  types?: string[];
  plus_code?: {
    compound_code?: string;
    global_code?: string;
  };
  // Viewport and bounds
  viewport?: {
    northeast: GoogleGeocodeLocation;
    southwest: GoogleGeocodeLocation;
  };
  bounds?: {
    northeast: GoogleGeocodeLocation;
    southwest: GoogleGeocodeLocation;
  };
}

// GeoGratis Geolocation API interfaces
export interface GeoGratisGeometry {
  type: string;
  coordinates: number[];
}

export interface GeoGratisResult {
  title: string;
  qualifier?: string;
  type?: string;
  geometry: GeoGratisGeometry;
  bbox?: number[];
  score?: number;
  component?: Record<string, unknown>;
}

export type GeoGratisResponse = GeoGratisResult[];

// Google Maps Batch Geocoding API types
export interface GoogleBatchGeocodeRequest {
  addresses: Array<{
    address: string;
  }>;
}

export interface GoogleBatchGeocodeResponse {
  results: Array<{
    address: string;
    geocoded_address: string;
    partial_match: boolean;
    place_id: string;
    postcode_localities: string[];
    types: string[];
    address_components?: Record<string, unknown>[];
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
      location_type: string;
      viewport: {
        northeast: { lat: number; lng: number };
        southwest: { lat: number; lng: number };
      };
    };
  }>;
}

// GeoJSON interfaces
export interface GeoJSONGeometry {
  type: "Polygon" | "MultiPolygon" | "LineString" | "Point";
  coordinates: number[][][] | number[][][][] | number[][] | number[];
}

export interface GeoJSONFeature {
  type: "Feature";
  geometry: GeoJSONGeometry;
  properties: Record<string, unknown>;
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

// Query and result interfaces
import type { ReturnField } from './return-selector';
export type { ReturnField };

export type CircuitBreakerExecutor = {
  execute: (key: string, fn: () => Promise<unknown>) => Promise<unknown>;
};

/** Schedule background work (e.g. KV cache writes) without blocking the response. */
export type DeferTaskFn = (task: Promise<unknown>) => void;

export interface QueryParams {
  address?: string;
  postal?: string;
  lat?: number;
  lon?: number;
  city?: string;
  state?: string; // province/state
  country?: string;
  /** Raw comma-separated return selector from query string or batch body */
  return?: string;
  /** Parsed return fields (set during validation) */
  returnFields?: ReturnField[];
  /** Raw include_province flag from query string or batch body */
  include_province?: string;
  /** Parsed include_province flag (set during validation) */
  includeProvince?: boolean;
  /** Raw geocode_method from query string or batch body */
  geocode_method?: string;
  /** Parsed geocode method (set during validation) */
  geocodeMethod?: 'auto' | 'postal_centroid';
}

export interface LookupResult {
  properties: Record<string, unknown> | null;
  riding?: string;
  normalizedAddress?: string;
  addressComponents?: GoogleAddressComponents;
}

// Lookup cache entry structure
export interface LookupCacheEntry {
  properties: Record<string, unknown> | null;
  riding?: string;
  point?: { lon: number; lat: number };
  normalizedAddress?: string;
  addressComponents?: GoogleAddressComponents;
  timestamp: number;
  dataset: string;
}

// Batch processing interfaces
export interface BatchLookupRequest {
  id: string;
  query: QueryParams;
  pathname: string;
}

export interface BatchRequest {
  endpoint: string;
  queries: Array<{
    id?: string;
    query: QueryParams;
  }>;
}

export interface BatchLookupResponse {
  id: string;
  query: QueryParams;
  point?: { lon: number; lat: number };
  properties: Record<string, unknown> | null;
  riding?: string;
  province_data?: { riding: string; properties: Record<string, unknown>; dataset: string } | null;
  municipality?: string;
  normalizedAddress?: string;
  addressComponents?: GoogleAddressComponents;
  error?: string;
  processingTime: number;
}

export interface BatchJob {
  id: string;
  requests: BatchLookupRequest[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
  results: BatchLookupResponse[];
  errors: string[];
}

// Configuration interfaces
export interface TimeoutConfig {
  geocoding: number;
  lookup: number;
  batch: number;
  total: number;
}

// Webhook interfaces
export interface WebhookConfig {
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: number;
  lastDelivery?: number;
  failureCount: number;
  maxFailures: number;
}

export interface WebhookEvent {
  id: string;
  webhookId: string;
  eventType: string;
  batchId: string;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  maxAttempts: number;
  status: 'pending' | 'delivered' | 'failed';
  lastAttempt?: number;
  nextRetry?: number;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventId: string;
  status: 'success' | 'failed';
  responseCode?: number;
  responseBody?: string;
  responseBodyTruncated?: boolean;
  attemptedAt: number;
  duration: number;
  error?: string;
}

// Spatial database interfaces
export interface SpatialDatabaseFeature {
  id: string;
  dataset: string;
  name: string;
  geometry: string; // WKT format
  properties: string; // JSON string
  centroid_lon: number;
  centroid_lat: number;
  bbox_min_lon: number;
  bbox_min_lat: number;
  bbox_max_lon: number;
  bbox_max_lat: number;
  created_at: number;
  updated_at: number;
}

// Circuit breaker interfaces
export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
  nextAttemptTime: number;
}

// Metrics interfaces
export interface Metrics {
  geocodingRequests: number;
  geocodingCacheHits: number;
  geocodingCacheMisses: number;
  geocodingErrors: number;
  geocodingSuccesses: number;
  geocodingFailures: number;
  geocodingCircuitBreakerTrips: number;
  r2Requests: number;
  r2CacheHits: number;
  r2CacheMisses: number;
  r2Errors: number;
  r2Successes: number;
  r2Failures: number;
  r2CircuitBreakerTrips: number;
  spatialIndexHits: number;
  spatialIndexMisses: number;
  totalSpatialIndexTime: number;
  lookupRequests: number;
  lookupCacheHits: number;
  lookupCacheMisses: number;
  lookupErrors: number;
  batchRequests: number;
  batchErrors: number;
  webhookDeliveries: number;
  webhookFailures: number;
  requestCount: number;
  errorCount: number;
  totalLookupTime: number;
  totalGeocodingTime: number;
  geocodingOdaTime: number;
  geocodingGeoGratisTime: number;
  geocodingFallbackTime: number;
  totalR2Time: number;
  totalBatchTime: number;
  totalWebhookTime: number;
}

// Cache warming interfaces
export interface CacheWarmingState {
  isRunning: boolean;
  lastWarmed: number;
  warmingCount: number;
  errorCount: number;
  lastError?: string;
  currentBatch: number;
  totalBatches: number;
  successCount: number;
  failureCount: number;
  nextWarmingTime: number;
}

// Spatial index interfaces
export interface SpatialIndex {
  entries: Array<{
    feature: GeoJSONFeature;
    boundingBox: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    };
  }>;
  boundingBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}
