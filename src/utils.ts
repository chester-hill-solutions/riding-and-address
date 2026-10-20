import { Env, QueryParams } from './types';
import { TIMEOUT_CONFIG, RETRY_CONFIG } from './config';
import {
  validateAndSanitizeQuery,
  type ValidationResult,
} from './input-validation';

/**
 * The dataset registry used to be re-exported from here "for backward compatibility".
 *
 * **It had no backward compatibility to preserve.** Every consumer — `routes.ts`, `cache.ts`,
 * `riding-lookup.ts`, `service-terms.ts`, `agent-discovery.ts`, `docs.ts`, `lookup-expansion.ts`
 * and two test files — already imported it from `./datasets` directly. Not one import came through
 * this path.
 *
 * So the re-export bought nothing and cost something: it was a *runtime* edge from `utils.ts` to
 * `datasets.ts`, and it was the edge that closed the datasets/cache import cycle. A
 * backward-compatibility shim with no users is not a compatibility shim; it is a coupling.
 */
export const DEFAULT_TIMEOUTS = TIMEOUT_CONFIG;
export const DEFAULT_RETRY_CONFIG = RETRY_CONFIG;

export const DEFAULT_RATE_LIMIT = 100; // requests per minute

/**
 * The keyless demo tier's per-IP throttle. One definition: the Worker, the route table, the MCP
 * tool text and the OpenAPI demo note all read it from here, so the number an agent is told cannot
 * drift from the number enforced. Guarded by scripts/check-billing-invariants.mjs.
 */
export const DEFAULT_DEMO_RATE_LIMIT = 30;

/**
 * The paid rail's own per-IP throttle. Deliberately not the demo bucket: an agent platform's egress
 * IP is shared, so a paying caller held to the demo bucket can be throttled by unrelated demo
 * traffic on the same address. This bucket is a separate key namespace, so the two cannot collide.
 */
export const DEFAULT_PAID_RATE_LIMIT = 100;

// Rate limiting store
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Drop every in-memory rate-limit entry.
 *
 * The in-memory limiter is the fallback used when the Durable Object binding is absent — local dev,
 * and most unit tests. Tests that assert on it have to start from a known state, and the counter is
 * module-level, so without this a test inherits whatever the previous one counted.
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

/**
 * Drop the expired entries from the in-memory rate-limit store.
 *
 * **Exported so a test can call it.** The sweep used to be unreachable from a test — `checkRateLimit`
 * calls it about one time in a hundred — so its body was covered at random and the file's coverage
 * number differed between two runs of the same suite. Exported, it is directly exercisable, and the
 * one-time-in-a-hundred decision to sweep lives only at the call site.
 *
 * Two jobs: drop the entries whose window has passed, and — if the store has grown past ten
 * thousand — keep only the most recent five thousand.
 */
export function cleanupRateLimitStore(): void {
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
/**
 * Rate-limit bucket for a request.
 *
 * Buckets used to key off the raw `X-Google-API-Key` header, which nobody validates: rotating the
 * value handed you a fresh bucket every request, so the limit could be walked around indefinitely.
 * Only an authenticated principal may name its own bucket; everything else is bucketed by IP.
 *
 * @param principal Verified identity (e.g. an accepted browser key id). Never take this from an
 *                  unvalidated header.
 */
export function getClientId(request: Request, principal?: string): string {
  if (principal) return `key:${principal}`;

  const cfConnectingIp = request.headers.get("CF-Connecting-IP");
  const xForwardedFor = request.headers.get("X-Forwarded-For");
  const ip = cfConnectingIp || xForwardedFor?.split(',')[0] || "unknown";
  return `ip:${ip}`;
}

/**
 * Whether a hostname names the local machine. Local development serves plain HTTP and has no
 * certificate, so anything that upgrades or canonicalises a scheme must leave loopback alone.
 */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
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

/** Extract a display riding name from feature properties across federal/provincial datasets. */
export function ridingNameFromProperties(
  properties: Record<string, unknown> | null | undefined
): string | undefined {
  if (!properties) return undefined;
  const candidates = [
    properties.ENGLISH_NAME,
    properties.ENGLISH_NA,
    properties.NAME_EN,
    properties.FED_NAME,
    properties.ED_NAMEE,
    properties.ED_NAME,
    properties.NM_CEP,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }
  return undefined;
}

/** Read include_province from URL search params (flag or explicit true/false). */
export function includeProvinceFromSearchParams(q: URLSearchParams): string | undefined {
  if (!q.has('include_province')) return undefined;
  const value = q.get('include_province');
  // Scalar and some clients send enabled boolean params as a presence-only flag.
  return value === '' ? 'true' : value ?? 'true';
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
    return: q.get("return") || undefined,
    include_province: includeProvinceFromSearchParams(q),
    geocode_method: q.get("geocode_method") || undefined,
    lat: q.get("lat") ? Number(q.get("lat")) : undefined,
    lon: q.get("lon") || q.get("lng") || q.get("long") ? Number(q.get("lon") || q.get("lng") || q.get("long")) : undefined
  };
  
  // Validate and sanitize
  const validation = validateAndSanitizeQuery(rawQuery, url.pathname);
  
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

/**
 * 5xx response that does not leak internals. The real error goes to the log, keyed by correlation
 * ID so it can be found; the client gets a generic message in the exact same ErrorResponse shape
 * as badRequest(). 4xx validation messages are intentional and should keep using badRequest.
 */
export function internalErrorResponse(
  error: unknown,
  context: string,
  correlationId?: string,
  code = 'INTERNAL_ERROR'
): Response {
  console.error(`[${correlationId ?? 'no-correlation-id'}] ${context}:`, error);
  return badRequest('Internal error', 500, code, correlationId);
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
      "WWW-Authenticate": "Basic realm=\"CanCoder API\""
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

/**
 * A stage timeout is not a failure. It is a transient condition, and the difference matters to the
 * caller: a 500 says "this is broken, stop", while a 503 with `Retry-After` says "try again".
 *
 * This exists because an ODA stage timeout is a **rethrow, not a fall-through** — `odaEntry` rethrows
 * it, and `walkProviderChain` rethrows anything that is not a `NoResultsError` — for **every** query
 * shape, not only a postal-only one. So a cold isolate whose first ODA query exceeds its stage budget
 * reached the caller as `LOOKUP_ERROR`, an internal error, for a request that would have succeeded a
 * second later. That is most of the 47 lookup errors the OpenNorth robustness run recorded, almost
 * all of them 30s geocoding timeouts under load.
 *
 * Deliberately still not a fall-through to the external geocoder. Timeouts cluster under load, so
 * falling back on a timeout would multiply external calls at the worst possible moment — the
 * opposite of what docs/plans/reduce-external-geocoder-fallback.md sets out to do. Retrying is the
 * caller's decision, and now they can make it.
 */
export function serviceUnavailableResponse(
  code: string,
  message: string,
  correlationId?: string,
  retryAfterSeconds = 5
): Response {
  const errorResponse: ErrorResponse = {
    error: message,
    code,
    timestamp: Date.now()
  };
  if (correlationId) errorResponse.correlationId = correlationId;

  return new Response(JSON.stringify(errorResponse), {
    status: 503,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "Retry-After": String(retryAfterSeconds)
    }
  });
}

// Authentication
function verifyBasicAuthCredentials(request: Request, env: Env): boolean {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }

  try {
    const encoded = authHeader.substring(6);
    const decoded = atob(encoded);
    return timingSafeEqual(decoded, env.BASIC_AUTH || "");
  } catch {
    return false;
  }
}

/** Compare without an early exit, so response time does not leak how much of the secret matched. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Basic auth for user-level routes.
 *
 * Security Model:
 * - Fails CLOSED: if BASIC_AUTH is not configured, nothing is authorized. For local dev, set
 *   BASIC_AUTH in .dev.vars (wrangler dev picks it up); in prod: wrangler secret put BASIC_AUTH.
 * - `X-Google-API-Key` used to grant access outright, by presence alone and with any value at all
 *   (`curl -H 'X-Google-API-Key: garbage'` was a complete bypass on every protected route). The
 *   header's real job is BYOK: it supplies the caller's own Google key for geocoding. Bringing a
 *   geocoding key is not the same as being authorized to use this service, so it no longer
 *   authenticates anything.
 */
export function checkBasicAuth(request: Request, env: Env): boolean {
  if (!env.BASIC_AUTH) return false;
  return verifyBasicAuthCredentials(request, env);
}

/**
 * True only when the caller actually presented valid credentials.
 *
 * Distinct from checkBasicAuth, which returns true when BASIC_AUTH is simply unconfigured --
 * "nobody is checking" is not the same as "this caller is authenticated", and only the latter
 * should unlock anything.
 *
 * BASIC_AUTH is a real secret held server-side, so it is not origin-bound: a request carrying it
 * is trusted from any domain. That is the web-service-key half of the split browser keys make up
 * the other half of.
 */
export function hasValidBasicAuth(request: Request, env: Env): boolean {
  if (!env.BASIC_AUTH) return false;
  return verifyBasicAuthCredentials(request, env);
}

/**
 * Checks if the request is authorized for admin/diagnostic routes.
 * BYOK bypass is intentionally not allowed here.
 *
 * Fails CLOSED: when BASIC_AUTH is unset, admin routes (/metrics, /webhooks, /api/database/*,
 * /admin/circuit-breaker/reset, /api/cache/warm, queue endpoints) are locked, not open. An
 * unconfigured secret must never expose operator surfaces on a public deployment.
 */
export function checkAdminAuth(request: Request, env: Env): boolean {
  if (!env.BASIC_AUTH) return false;
  return verifyBasicAuthCredentials(request, env);
}

/** Run `task` now, or hand it to the response's waitUntil when deferring. */
export async function runOrDefer(deferTask: ((task: Promise<unknown>) => void) | undefined, task: Promise<void>): Promise<void> {
  if (deferTask) {
    deferTask(task);
  } else {
    await task;
  }
}
