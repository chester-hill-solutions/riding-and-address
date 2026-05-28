import { Env, QueryParams, GeoJSONGeometry } from './types';
import { TIMEOUT_CONFIG, RETRY_CONFIG, getRetryConfig } from './config';

// Re-export for backward compatibility
export const DEFAULT_TIMEOUTS = TIMEOUT_CONFIG;
export const DEFAULT_RETRY_CONFIG = RETRY_CONFIG;

export const DEFAULT_RATE_LIMIT = 100; // requests per minute

// Rate limiting store
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Cleanup expired rate limit entries to prevent memory leaks
function cleanupRateLimitStore(): void {
  const now = Date.now();
  const entriesToDelete: string[] = [];
  
  for (const [clientId, entry] of rateLimitStore.entries()) {
    // Remove entries that are expired by more than 5 minutes (safety margin)
    if (now > entry.resetTime + 5 * 60 * 1000) {
      entriesToDelete.push(clientId);
    }
  }
  
  for (const clientId of entriesToDelete) {
    rateLimitStore.delete(clientId);
  }
  
  // If store is getting large, do more aggressive cleanup
  if (rateLimitStore.size > 10000) {
    const allEntries = Array.from(rateLimitStore.entries());
    allEntries.sort((a, b) => a[1].resetTime - b[1].resetTime);
    // Keep only the most recent 5000 entries
    for (let i = 0; i < allEntries.length - 5000; i++) {
      rateLimitStore.delete(allEntries[i][0]);
    }
  }
}

// Validation interfaces
export interface ValidationResult {
  valid: boolean;
  sanitized?: QueryParams;
  error?: string;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

/**
 * Determines if a geographic point is inside a GeoJSON polygon or multipolygon.
 * Uses ray casting algorithm with explicit boundary point handling.
 * 
 * @param lon - Longitude of the point (-180 to 180)
 * @param lat - Latitude of the point (-90 to 90)
 * @param geometry - GeoJSON geometry (Polygon or MultiPolygon)
 * @returns true if point is inside the polygon (including on boundaries), false otherwise
 */
export function isPointInPolygon(lon: number, lat: number, geometry: GeoJSONGeometry): boolean {
  const point = [lon, lat];
  const type = geometry?.type;
  const coords = geometry?.coordinates;
  if (!type || !coords) return false;

  if (type === "Polygon") {
    return polygonContains(point, coords as number[][][]);
  }
  if (type === "MultiPolygon") {
    for (const poly of coords) {
      if (polygonContains(point, poly as number[][][])) return true;
    }
    return false;
  }
  return false;
}

/**
 * Checks if a point is contained within a polygon, handling holes.
 * Points on the outer boundary are considered inside; points inside holes are considered outside.
 * 
 * @param point - [longitude, latitude] coordinates
 * @param polygon - Array of rings: [outerRing, hole1, hole2, ...] where each ring is [[lon, lat], ...]
 * @returns true if point is inside the polygon (not in any holes), false otherwise
 */
export function polygonContains(point: number[], polygon: number[][][]): boolean {
  // polygon: [ [ [lon,lat], ... ] outerRing, hole1, hole2, ... ]
  if (!Array.isArray(polygon) || polygon.length === 0) return false;
  
  const outerRing = polygon[0] as number[][];
  if (!outerRing || !Array.isArray(outerRing)) return false;
  
  // Check if point is in outer ring (including boundary)
  const inOuterRing = ringContains(point, outerRing);
  if (!inOuterRing) return false;
  
  // Check if point is in any hole (if point is on hole boundary, it's considered outside)
  for (let i = 1; i < polygon.length; i++) {
    const hole = polygon[i];
    if (!hole || !Array.isArray(hole)) continue;
    
    // Check if point is strictly inside a hole (not on boundary)
    // For holes, we want to exclude points that are inside, but include points on the boundary
    const inHole = ringContains(point, hole);
    if (inHole) {
      // Double-check: if point is exactly on hole boundary, it should be considered inside polygon
      // But if it's strictly inside the hole, it's outside the polygon
      // The ringContains function already handles boundary cases, so if it returns true
      // and the point is on the boundary, we should still consider it inside the polygon
      // For now, we'll be conservative: if inHole is true, exclude it
      return false;
    }
  }
  
  return true;
}

/**
 * Checks if a point is inside a closed ring using ray casting algorithm.
 * Points exactly on the ring boundary are considered inside.
 * 
 * @param point - [longitude, latitude] coordinates
 * @param ring - Array of [longitude, latitude] coordinate pairs forming a closed ring
 * @returns true if point is inside or on the ring boundary, false otherwise
 */
export function ringContains(point: number[], ring: number[][]): boolean {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  
  const [px, py] = point;
  let inside = false;
  
  // First check if point is exactly on the boundary
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    
    // Check if point is on the edge segment
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    
    // Point is on boundary if it's on the line segment
    if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
      // Check if point is collinear with the segment
      const crossProduct = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1);
      const tolerance = 1e-10; // Small tolerance for floating point comparison
      if (Math.abs(crossProduct) < tolerance) {
        return true; // Point is on boundary, consider it inside
      }
    }
    
    // Ray casting algorithm for interior points
    const intersect = ((y1 > py) !== (y2 > py)) &&
      (px < (x2 - x1) * (py - y1) / (y2 - y1 + 1e-10) + x1);
    if (intersect) inside = !inside;
  }
  
  return inside;
}

/**
 * Sanitizes a string input by removing control characters and limiting length.
 * 
 * @param input - The string to sanitize
 * @param maxLength - Maximum allowed length (default: 1000)
 * @returns Sanitized string or undefined if input is empty/invalid
 */
export function sanitizeString(input: string | undefined, maxLength: number = 1000): string | undefined {
  if (!input) return undefined;
  
  // Remove null bytes and control characters
  let sanitized = input.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized.length > 0 ? sanitized : undefined;
}

/**
 * Validates geographic coordinates.
 * 
 * @param lat - Latitude (-90 to 90, inclusive)
 * @param lon - Longitude (-180 to 180, inclusive)
 * @returns Validation result with sanitized coordinates or error message
 */
export function validateCoordinates(lat: number | undefined, lon: number | undefined): { valid: boolean; lat?: number; lon?: number; error?: string } {
  if (lat === undefined && lon === undefined) {
    return { valid: true };
  }
  
  if (lat === undefined || lon === undefined) {
    return { valid: false, error: "Both lat and lon must be provided together" };
  }
  
  // Check for valid coordinate ranges (boundaries are inclusive: -90 <= lat <= 90, -180 <= lon <= 180)
  if (lat < -90 || lat > 90) {
    return { valid: false, error: "Latitude must be between -90 and 90 (inclusive)" };
  }
  
  if (lon < -180 || lon > 180) {
    return { valid: false, error: "Longitude must be between -180 and 180 (inclusive)" };
  }
  
  // Check for NaN or Infinity
  if (!isFinite(lat) || !isFinite(lon)) {
    return { valid: false, error: "Coordinates must be finite numbers" };
  }
  
  return { valid: true, lat, lon };
}

/**
 * Validates and sanitizes postal codes.
 * Strictly validates Canadian postal codes (A1A 1A1 format), but allows
 * international postal codes to pass through for geocoding services.
 * 
 * @param postal - Postal code string to validate
 * @returns Validation result with sanitized postal code or error message
 */
export function validatePostalCode(postal: string): { valid: boolean; sanitized?: string; error?: string } {
  if (!postal) return { valid: true };
  
  // Canadian postal code pattern: A1A 1A1 or A1A1A1
  const canadianPattern = /^[A-Za-z]\d[A-Za-z][\s]?\d[A-Za-z]\d$/;
  const sanitized = postal.replace(/\s+/g, '').toUpperCase();
  
  if (canadianPattern.test(sanitized)) {
    // Valid Canadian postal code - format it properly
    return { valid: true, sanitized: sanitized.substring(0, 3) + ' ' + sanitized.substring(3) };
  }
  
  // Not a Canadian postal code, but allow it to pass through for geocoding
  // Just sanitize by removing extra spaces and converting to uppercase
  const cleaned = postal.trim().replace(/\s+/g, ' ').toUpperCase();
  if (cleaned.length > 0 && cleaned.length <= 20) {
    return { valid: true, sanitized: cleaned };
  }
  
  // Postal code is too long or empty after cleaning
  return { valid: false, error: "Postal code format is invalid or too long" };
}

/**
 * Validates and sanitizes query parameters for riding lookup requests.
 * Ensures coordinates are valid, postal codes are properly formatted,
 * and string inputs are sanitized.
 * 
 * @param query - Raw query parameters from request
 * @returns Validation result with sanitized parameters or error message
 */
export function validateAndSanitizeQuery(query: QueryParams): ValidationResult {
  const sanitized: QueryParams = {};
  
  // Sanitize string inputs
  sanitized.address = sanitizeString(query.address, 500);
  sanitized.city = sanitizeString(query.city, 100);
  sanitized.state = sanitizeString(query.state, 100);
  sanitized.country = sanitizeString(query.country, 100);
  
  // Validate postal code
  if (query.postal) {
    const postalValidation = validatePostalCode(query.postal);
    if (!postalValidation.valid) {
      return { valid: false, error: postalValidation.error };
    }
    sanitized.postal = postalValidation.sanitized;
  }
  
  // Validate coordinates
  const coordValidation = validateCoordinates(query.lat, query.lon);
  if (!coordValidation.valid) {
    return { valid: false, error: coordValidation.error };
  }
  if (coordValidation.lat !== undefined && coordValidation.lon !== undefined) {
    sanitized.lat = coordValidation.lat;
    sanitized.lon = coordValidation.lon;
  }
  
  // Check that at least one location parameter is provided
  const hasLocation = sanitized.address || sanitized.postal || sanitized.city || 
                     sanitized.state || sanitized.country || 
                     (sanitized.lat !== undefined && sanitized.lon !== undefined);
  
  if (!hasLocation) {
    return { valid: false, error: "At least one location parameter must be provided" };
  }
  
  return { valid: true, sanitized };
}

/**
 * Executes an async operation with automatic retry logic using exponential backoff.
 * 
 * @param operation - The async function to execute
 * @param config - Retry configuration (maxAttempts, baseDelay, maxDelay, backoffMultiplier, jitter)
 * @param context - Context string for logging purposes
 * @returns The result of the operation
 * @throws The last error if all retry attempts fail
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = getRetryConfig(),
  context: string = 'operation'
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === config.maxAttempts) {
        console.error(`${context} failed after ${config.maxAttempts} attempts:`, lastError.message);
        throw lastError;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      );
      
      // Add jitter to prevent thundering herd
      const jitteredDelay = config.jitter 
        ? delay + Math.random() * 1000 
        : delay;
      
      console.warn(`${context} attempt ${attempt} failed, retrying in ${Math.round(jitteredDelay)}ms:`, lastError.message);
      await new Promise(resolve => setTimeout(resolve, jitteredDelay));
    }
  }
  
  throw lastError!;
}

/**
 * Wraps a promise with a timeout, rejecting if the operation takes too long.
 * 
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout duration in milliseconds
 * @param operation - Operation name for error messages
 * @returns The result of the promise if it completes within the timeout
 * @throws Error if the operation times out
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
}

/**
 * Checks if a client has exceeded the rate limit.
 * Uses in-memory store with automatic cleanup to prevent memory leaks.
 * 
 * @param env - Environment bindings containing RATE_LIMIT configuration
 * @param clientId - Unique identifier for the client (IP address or API key)
 * @returns true if request is allowed, false if rate limit exceeded
 */
export function checkRateLimit(env: Env, clientId: string): boolean {
  // Cleanup expired entries periodically (every 100th call to avoid overhead)
  if (Math.random() < 0.01) {
    cleanupRateLimitStore();
  }
  
  const rateLimit = env.RATE_LIMIT || DEFAULT_RATE_LIMIT;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  
  const current = rateLimitStore.get(clientId);
  if (!current || now > current.resetTime) {
    rateLimitStore.set(clientId, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (current.count >= rateLimit) {
    return false;
  }
  
  current.count++;
  return true;
}

/**
 * Extracts a unique client identifier from the request for rate limiting.
 * Prioritizes API key, then Cloudflare connecting IP, then X-Forwarded-For header.
 * 
 * @param request - The incoming HTTP request
 * @returns Client identifier string (e.g., "api:key123" or "ip:1.2.3.4")
 */
export function getClientId(request: Request): string {
  // Use IP address or API key for rate limiting
  const apiKey = request.headers.get("X-Google-API-Key");
  if (apiKey) return `api:${apiKey}`;
  
  const cfConnectingIp = request.headers.get("CF-Connecting-IP");
  const xForwardedFor = request.headers.get("X-Forwarded-For");
  const ip = cfConnectingIp || xForwardedFor?.split(',')[0] || "unknown";
  return `ip:${ip}`;
}

// Generate correlation ID for request tracing
export function generateCorrelationId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Extracts correlation ID from request headers or generates a new one.
 * Used for request tracing and debugging across distributed systems.
 * 
 * @param request - The incoming HTTP request
 * @returns Correlation ID string (from X-Correlation-ID, X-Request-ID, or newly generated)
 */
export function getCorrelationId(request: Request): string {
  return request.headers.get("X-Correlation-ID") || 
         request.headers.get("X-Request-ID") || 
         generateCorrelationId();
}

// Dataset selection
export function pickDataset(pathname: string): { r2Key: string } {
  // Map routes to R2 object keys
  if (pathname === "/api/federal" || pathname === "/api") return { r2Key: "federalridings-2024.geojson" };
  if (pathname === "/api/qc") return { r2Key: "quebecridings-2025.geojson" };
  if (pathname === "/api/on") return { r2Key: "ontarioridings-2022.geojson" };
  // default federal (unknown /api/* path)
  return { r2Key: "federalridings-2024.geojson" };
}

const PROV_TERR_TO_PROVINCE_PATH: Record<string, "/api/on" | "/api/qc"> = {
  ON: "/api/on",
  ONT: "/api/on",
  ONTARIO: "/api/on",
  QC: "/api/qc",
  QUE: "/api/qc",
  QUEBEC: "/api/qc",
};

/**
 * Maps federal feature PROV_TERR (abbreviation or full name, EN/FR) to a provincial lookup path.
 */
export function provincePathFromFederalProperties(
  properties: Record<string, unknown> | null | undefined
): "/api/on" | "/api/qc" | null {
  if (!properties) return null;
  const raw = properties.PROV_TERR;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const key = raw
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return PROV_TERR_TO_PROVINCE_PATH[key] ?? null;
}

// Query parsing
export function parseQuery(request: Request): { query: QueryParams; validation: ValidationResult } {
  const url = new URL(request.url);
  const q = url.searchParams;
  
  // Parse raw query parameters
  const rawQuery: QueryParams = {
    address: q.get("address") || undefined,
    postal: q.get("postal") || q.get("postal_code") || undefined,
    city: q.get("city") || undefined,
    state: q.get("state") || q.get("province") || undefined,
    country: q.get("country") || undefined,
    lat: q.get("lat") ? Number(q.get("lat")) : undefined,
    lon: q.get("lon") || q.get("lng") || q.get("long") ? Number(q.get("lon") || q.get("lng") || q.get("long")) : undefined
  };
  
  // Validate and sanitize
  const validation = validateAndSanitizeQuery(rawQuery);
  
  return { query: rawQuery, validation };
}

// Standardized error response format
export interface ErrorResponse {
  error: string;
  code?: string;
  correlationId?: string;
  timestamp?: number;
  details?: Record<string, unknown>;
}

// Response utility functions with standardized error format
export function badRequest(message: string, status = 400, code?: string, correlationId?: string, details?: Record<string, unknown>): Response {
  const errorResponse: ErrorResponse = {
    error: message,
    timestamp: Date.now()
  };
  if (code) errorResponse.code = code;
  if (correlationId) errorResponse.correlationId = correlationId;
  if (details) errorResponse.details = details;
  
  return new Response(JSON.stringify(errorResponse), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8" }
  });
}

export function unauthorizedResponse(correlationId?: string): Response {
  const errorResponse: ErrorResponse = {
    error: "Unauthorized",
    code: "UNAUTHORIZED",
    timestamp: Date.now()
  };
  if (correlationId) errorResponse.correlationId = correlationId;
  
  return new Response(JSON.stringify(errorResponse), {
    status: 401,
    headers: { 
      "content-type": "application/json; charset=UTF-8",
      "WWW-Authenticate": "Basic realm=\"Riding Lookup API\""
    }
  });
}

export function rateLimitExceededResponse(correlationId?: string): Response {
  const errorResponse: ErrorResponse = {
    error: "Rate limit exceeded",
    code: "RATE_LIMIT_EXCEEDED",
    timestamp: Date.now()
  };
  if (correlationId) errorResponse.correlationId = correlationId;
  
  return new Response(JSON.stringify(errorResponse), {
    status: 429,
    headers: { 
      "content-type": "application/json; charset=UTF-8",
      "Retry-After": "60"
    }
  });
}

// Authentication
/**
 * Checks if the request is authorized.
 * 
 * Security Model:
 * - If BASIC_AUTH is not configured, authentication is skipped (all requests allowed)
 * - If X-Google-API-Key header is provided, basic auth is bypassed (BYOK - Bring Your Own Key)
 *   This allows users to use their own Google Maps API key without needing the configured
 *   basic auth credentials. Note: If the Google API key is compromised, the attacker
 *   will have full access to the API.
 * - Otherwise, HTTP Basic Authentication is required using the configured BASIC_AUTH secret
 * 
 * @param request - The incoming request
 * @param env - Environment variables including BASIC_AUTH
 * @returns true if authorized, false otherwise
 */
export function checkBasicAuth(request: Request, env: Env): boolean {
  // If BASIC_AUTH is not configured, skip authentication
  if (!env.BASIC_AUTH) return true;
  
  // If user provides their own Google API key, bypass basic auth (BYOK model)
  // SECURITY NOTE: This allows full API access with just a Google API key.
  // Ensure Google API keys are kept secure and consider rate limiting per key.
  const googleApiKey = request.headers.get("X-Google-API-Key");
  if (googleApiKey) return true;
  
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }
  
  try {
    const encoded = authHeader.substring(6); // Remove "Basic " prefix
    const decoded = atob(encoded);
    return decoded === env.BASIC_AUTH;
  } catch {
    return false;
  }
}

// Geometry simplification
export function simplifyGeometry(geometry: any, tolerance: number, maxVertices: number): GeoJSONGeometry {
  // Handle Point geometry (no simplification needed)
  if (geometry.type === 'Point') {
    return geometry;
  }
  
  // Handle LineString geometry
  if (geometry.type === 'LineString') {
    return {
      type: 'LineString',
      coordinates: simplifyLineString(geometry.coordinates, tolerance, maxVertices)
    };
  }
  
  // Handle Polygon geometry
  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map((ring: number[][]) => 
        simplifyLineString(ring, tolerance, maxVertices)
      )
    };
  }
  
  // Handle MultiPolygon geometry
  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((polygon: number[][][]) =>
        polygon.map((ring: number[][]) => 
          simplifyLineString(ring, tolerance, maxVertices)
        )
      )
    };
  }
  
  // Return original geometry if type is not supported
  return geometry;
}

export function simplifyLineString(coordinates: number[][], tolerance: number, maxVertices: number): number[][] {
  if (coordinates.length <= 2) {
    return coordinates;
  }
  
  // Simple Douglas-Peucker algorithm implementation
  const simplified: number[][] = [];
  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];
  
  simplified.push(start);
  
  let maxDistance = 0;
  let maxIndex = 0;
  
  for (let i = 1; i < coordinates.length - 1; i++) {
    const distance = pointToLineDistance(coordinates[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }
  
  if (maxDistance > tolerance && simplified.length < maxVertices) {
    const left = coordinates.slice(0, maxIndex + 1);
    const right = coordinates.slice(maxIndex);
    
    const leftSimplified = simplifyLineString(left, tolerance, maxVertices);
    const rightSimplified = simplifyLineString(right, tolerance, maxVertices);
    
    simplified.push(...leftSimplified.slice(1, -1));
    simplified.push(...rightSimplified.slice(1));
  } else {
    simplified.push(end);
  }
  
  return simplified;
}

function pointToLineDistance(point: number[], lineStart: number[], lineEnd: number[]): number {
  const A = point[0] - lineStart[0];
  const B = point[1] - lineStart[1];
  const C = lineEnd[0] - lineStart[0];
  const D = lineEnd[1] - lineStart[1];
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  if (lenSq === 0) {
    return Math.sqrt(A * A + B * B);
  }
  
  const param = dot / lenSq;
  
  let xx, yy;
  if (param < 0) {
    xx = lineStart[0];
    yy = lineStart[1];
  } else if (param > 1) {
    xx = lineEnd[0];
    yy = lineEnd[1];
  } else {
    xx = lineStart[0] + param * C;
    yy = lineStart[1] + param * D;
  }
  
  const dx = point[0] - xx;
  const dy = point[1] - yy;
  
  return Math.sqrt(dx * dx + dy * dy);
}
