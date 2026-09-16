/// <reference types="@cloudflare/workers-types" />

import {
  Env
} from './types';
import {
  handleGeocodeRoute,
  handleReverseRoute,
  handleNormalizeAddressRoute,
  handleSearchRoute,
} from './oda-handlers';
import { isOdaSuggestEnabled } from './oda-config';
import { performCacheWarming } from './cache';
import { geocodingCircuitBreaker, initializeCircuitBreakers, r2CircuitBreaker } from './circuit-breaker';
import { incrementMetric, recordTiming } from './metrics';
import { 
  checkAdminAuth,
  hasValidBasicAuth,
  badRequest,
  internalErrorResponse,
  unauthorizedResponse,
  rateLimitExceededResponse,
  checkRateLimit,
  getClientId,
  getCorrelationId,
} from './utils';
import { getAllR2Keys } from './datasets';
import { handleLookupRequest } from './lookup-handler';
import { resolveLookupPath } from './return-selector';
import {
  initializeSpatialDatabase,
  getAllFeaturesFromDatabase,
  getSpatialDatabaseStats,
  syncGeoJSONToDatabase,
  getSpatialDbConfig,
  queryRidingFromDatabase
} from './spatial';
import { 
  processWebhookEvents,
  cleanupWebhookData
} from './webhooks';
import {
  processBatchLookupWithBatchGeocoding,
  redactFuseDeniedResult,
  submitBatchToQueue,
  getBatchStatus,
  processQueueJobs
} from './batch';
import { safeParseBatchLookupRequests } from './validation';
import { QueueManagerDO } from './queue-manager';
import { ApiKeyUsageDO } from './api-key-usage-do';
import { CircuitBreakerDO } from './circuit-breaker-do';
import { createRouteContext, dispatch, type RouteContext } from './routes';
import {
  apiKeysEnabled,
  authorizeLookupRequest,
  extractApiKey,
  httpStatusForKeyDenial,
  type KeyAuthResult,
} from './api-keys';
import { handleProjectionRequest } from './projection-handlers';
import { getStats as getQueueStats } from './queue-client';
import { cachedLookupRiding as lookupRiding, loadGeo } from './riding-lookup';
import { recordSuccessfulBillable, type BillableAuthContext } from './billing';

function keyAuthFailureResponse(auth: KeyAuthResult, correlationId: string): Response {
  const status = auth.reason ? httpStatusForKeyDenial(auth.reason) : 401;
  return badRequest(auth.message || 'Unauthorized', status, auth.reason || 'UNAUTHORIZED', correlationId);
}

function billingFromAuth(auth: KeyAuthResult): BillableAuthContext | null {
  if (auth.key && auth.customer) {
    return { key: auth.key, customer: auth.customer };
  }
  return null;
}

// Global state

/**
 * Handle scheduled events (Cron Triggers) for cache warming.
 */
async function handleScheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
  console.log(`[Cron] Scheduled event triggered: ${event.cron}`);
  
  // Perform cache warming
  try {
    await performCacheWarming(env, async (env: Env, r2Key: string) => {
      await loadGeo(env, r2Key);
    }, lookupRiding);
    console.log('[Cron] Cache warming completed successfully');
  } catch (error) {
    console.error('[Cron] Cache warming failed:', error);
  }

  // Process pending webhook events
  try {
    await processWebhookEvents(env);
    console.log('[Cron] Webhook processing completed successfully');
  } catch (error) {
    console.error('[Cron] Webhook processing failed:', error);
  }

  // Cleanup old webhook data
  try {
    await cleanupWebhookData(env);
    console.log('[Cron] Webhook cleanup completed successfully');
  } catch (error) {
    console.error('[Cron] Webhook cleanup failed:', error);
  }
}

/**
 * Main Cloudflare Worker entry point.
 * Handles all incoming HTTP requests and routes them to appropriate handlers.
 * 
 * @param request - The incoming HTTP request
 * @param env - Cloudflare Worker environment bindings (R2, KV, D1, Durable Objects, etc.)
 * @returns HTTP response with lookup results, error messages, or API documentation
 * 
 * Supported endpoints:
 * - GET /api, /api/federal, /api/combined, /api/{province} - Riding lookup endpoints (see datasets registry)
 * - GET /api/batch - Batch lookup processing
 * - POST /api/batch/queue - Submit batch to queue
 * - GET /api/batch/status - Get batch status
 * - POST /api/batch/process - Process queue jobs
 * - POST /api/database/* - Spatial database management
 * - GET /api/boundaries - Get riding boundaries
 * - GET /webhooks - Webhook management
 * - GET /, /docs, /swagger - API documentation
 */

/**
 * The original `fetch` guard-chain, kept as the strangler fallback for entries still marked
 * `handler: legacy`. The gateway surface is ported (docs, health, metrics, cache-warming,
 * circuit-breaker reset, webhook admin); the branches below cover everything not yet ported.
 */
async function legacyFetch(routeCtx: RouteContext): Promise<Response> {
  const { request, env, url } = routeCtx;
  const pathname = url.pathname;
  const correlationId = routeCtx.correlationId;

  // Handle database endpoints
  if (pathname.startsWith('/api/database')) {
    if (pathname === '/api/database/init' && request.method === 'POST') {
      if (!checkAdminAuth(request, env)) {
        return unauthorizedResponse(correlationId);
      }
      
      try {
        const success = await initializeSpatialDatabase(env);
        return new Response(JSON.stringify({
          success,
          message: success ? "Database initialized successfully" : "Database initialization failed"
        }), {
          headers: { 
            "content-type": "application/json; charset=UTF-8",
            ...routeCtx.corsHeaders(request.headers.get('Origin'))
          }
        });
      } catch (error) {
        return internalErrorResponse(error, 'Database initialization failed', correlationId);
      }
    }
    
    if (pathname === '/api/database/sync' && request.method === 'POST') {
      if (!checkAdminAuth(request, env)) {
        return unauthorizedResponse(correlationId);
      }
      
      try {
        const body = await request.json() as { dataset?: string };
        const dataset = body.dataset || 'federalridings-2024.geojson';

        const result = await syncGeoJSONToDatabase(env, dataset, loadGeo);
        return new Response(JSON.stringify({
          success: result.success,
          inserted: result.inserted,
          failed: result.failed,
          message: result.success
            ? `Database synced for ${dataset}`
            : `Database sync incomplete for ${dataset}`,
          dataset
        }), {
          headers: { 
            "content-type": "application/json; charset=UTF-8",
            ...routeCtx.corsHeaders(request.headers.get('Origin'))
          }
        });
      } catch (error) {
        return internalErrorResponse(error, 'Database sync failed', correlationId);
      }
    }
    
    if (pathname === '/api/database/stats' && request.method === 'GET') {
      if (!checkAdminAuth(request, env)) {
        return unauthorizedResponse(correlationId);
      }
      
      try {
        const stats = await getSpatialDatabaseStats(env);
        return new Response(JSON.stringify({
          enabled: stats !== null,
          status: stats !== null ? "active" : "disabled",
          // Real D1 counts only — no placeholder fields when the database is disabled.
          ...(stats !== null ? { features: stats.features, lastSync: stats.lastSync } : {})
        }), {
          headers: {
            "content-type": "application/json; charset=UTF-8",
            ...routeCtx.corsHeaders(request.headers.get('Origin'))
          }
        });
      } catch (error) {
        return internalErrorResponse(error, 'Failed to get database stats', correlationId);
      }
    }
    
    if (pathname === '/api/database/query' && request.method === 'GET') {
      const lat = parseFloat(url.searchParams.get('lat') || '');
      const lon = parseFloat(url.searchParams.get('lon') || '');
      const dataset = url.searchParams.get('dataset') || 'federalridings-2024.geojson';
      
      if (isNaN(lat) || isNaN(lon)) {
        return badRequest('Invalid lat/lon parameters', 400);
      }
      
      try {
        const result = await queryRidingFromDatabase(env, dataset, lon, lat);
        return new Response(JSON.stringify(result), {
          headers: { 
            "content-type": "application/json; charset=UTF-8",
            ...routeCtx.corsHeaders(request.headers.get('Origin'))
          }
        });
      } catch (error) {
        return internalErrorResponse(error, 'Database query failed', correlationId);
      }
    }
    
    return badRequest("Database endpoint not found", 404);
  }
  
  // Handle boundaries endpoints
  if (pathname.startsWith('/api/boundaries')) {
    if (pathname === '/api/boundaries/lookup' && request.method === 'GET') {
      const lat = parseFloat(url.searchParams.get('lat') || '');
      const lon = parseFloat(url.searchParams.get('lon') || '');
      
      if (isNaN(lat) || isNaN(lon)) {
        return badRequest('Invalid lat/lon parameters', 400);
      }
      
      try {
        const result = await lookupRiding(env, resolveLookupPath('/api').datasetPath, lon, lat);
        return new Response(JSON.stringify(result), {
          headers: { 
            "content-type": "application/json; charset=UTF-8",
            ...routeCtx.corsHeaders(request.headers.get('Origin'))
          }
        });
      } catch (error) {
        return internalErrorResponse(error, 'Boundaries lookup failed', correlationId);
      }
    }
    
    if (pathname === '/api/boundaries/all' && request.method === 'GET') {
      const dataset = url.searchParams.get('dataset') || 'federalridings-2024.geojson';
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      
      try {
        const dbConfig = getSpatialDbConfig(env);
        if (dbConfig.ENABLED && env.RIDING_DB) {
          const result = await getAllFeaturesFromDatabase(env, dataset, limit, offset);
          return new Response(JSON.stringify(result), {
            headers: { 
              "content-type": "application/json; charset=UTF-8",
              ...routeCtx.corsHeaders(request.headers.get('Origin'))
            }
          });
        } else {
          return badRequest('Spatial database not enabled', 503);
        }
      } catch (error) {
        return internalErrorResponse(error, 'Failed to get boundaries', correlationId);
      }
    }
    
    if (pathname === '/api/boundaries/config' && request.method === 'GET') {
      const dbConfig = getSpatialDbConfig(env);
      return new Response(JSON.stringify({
        enabled: dbConfig.ENABLED,
        useRtreeIndex: dbConfig.USE_RTREE_INDEX,
        batchInsertSize: dbConfig.BATCH_INSERT_SIZE,
        datasets: getAllR2Keys()
      }), {
        headers: { 
          "content-type": "application/json; charset=UTF-8",
          ...routeCtx.corsHeaders(request.headers.get('Origin'))
        }
      });
    }
    
    return badRequest("Boundaries endpoint not found", 404);
  }
  
  // Handle geocoding batch status endpoint
  if (pathname === "/api/geocoding/batch/status") {
    if (request.method === "GET") {
      return new Response(JSON.stringify({
        enabled: true,
        maxBatchSize: 10,
        timeout: 30000,
        retryAttempts: 3,
        fallbackToIndividual: true,
        hasGoogleApiKey: !!(env.GOOGLE_MAPS_KEY),
        timestamp: Date.now()
      }), {
        headers: { 
          "content-type": "application/json; charset=UTF-8",
          ...routeCtx.corsHeaders(request.headers.get('Origin'))
        }
      });
    } else {
      return badRequest("Method not allowed", 405);
    }
  }
  
  // Handle cache warming endpoints
  if (pathname === "/api/cache/warm") {
    if (request.method === "POST") {
      if (!checkAdminAuth(request, env)) {
        return unauthorizedResponse(correlationId);
      }
      
      try {
        const body = await request.json() as { locations?: Array<{ lat: number; lon: number; postal?: string }> };
        const locations = body.locations || [];
        
        for (const location of locations) {
          if (location.lat && location.lon) {
            await loadGeo(env, 'federalridings-2024.geojson');
          }
          // Postal-only entries have never warmed anything here; geocoding them first
          // would be required, and that work belongs to performCacheWarming.
        }
        
        return new Response(JSON.stringify({
          message: "Cache warming initiated",
          locations: locations.length,
          timestamp: Date.now()
        }), {
          headers: { 
            "content-type": "application/json; charset=UTF-8",
            ...routeCtx.corsHeaders(request.headers.get('Origin'))
          }
        });
      } catch (error) {
        return internalErrorResponse(error, 'Cache warming failed', correlationId);
      }
    } else {
      return badRequest("Method not allowed", 405);
    }
  }
  
  // Batch processing endpoints
  if (pathname.startsWith('/batch')) {
    // Enterprise batch: operator BASIC_AUTH OR Customer Server key with batchEnabled
    let batchBilling: BillableAuthContext | null = null;
    if (apiKeysEnabled(env)) {
      const basic = hasValidBasicAuth(request, env);
      if (!basic) {
        const auth = await authorizeLookupRequest(env, request, false);
        if (!auth.ok) return keyAuthFailureResponse(auth, correlationId);
        if (!auth.customer?.batchEnabled) {
          return badRequest(
            'Batch requires an Enterprise Customer with batchEnabled',
            403,
            'BATCH_NOT_ENABLED',
            correlationId
          );
        }
        batchBilling = billingFromAuth(auth);
      }
    } else if (!checkAdminAuth(request, env)) {
      return unauthorizedResponse(correlationId);
    }
    
    if (pathname === '/batch' && request.method === 'POST') {
      try {
        // Check request body size (limit to 10MB)
        const contentLength = request.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
          return badRequest('Request body too large. Maximum size is 10MB', 413);
        }
        
        const body = await request.json() as { requests?: unknown };
        if (!body.requests || !Array.isArray(body.requests)) {
          return badRequest("Invalid request body. Expected 'requests' array.", 400);
        }

        const parsedRequests = safeParseBatchLookupRequests(body.requests);
        if (!parsedRequests.success) {
          return badRequest(
            parsedRequests.error.issues.map((e) => e.message).join('; '),
            400,
            'INVALID_BATCH_REQUEST'
          );
        }

        const results = await processBatchLookupWithBatchGeocoding(routeCtx, parsedRequests.data);

        // Same Billable unit as realtime: each successful item without error.
        // Once the fuse denies an increment, redact that item and all remaining
        // successes so results are not returned free past the hard fuse. The denial
        // body comes from the one billing shaper, so batch speaks the same dialect.
        if (batchBilling) {
          let fuseDenial: Record<string, unknown> | null = null;
          for (const item of results) {
            if (item.error) continue;
            if (fuseDenial) {
              redactFuseDeniedResult(item, fuseDenial);
              continue;
            }
            const billed = await recordSuccessfulBillable(env, batchBilling, {
              waitUntil: routeCtx.deferTask,
            });
            if (!billed.allowed) {
              fuseDenial = routeCtx.billableDenialBody(billed);
              redactFuseDeniedResult(item, fuseDenial);
            }
          }
        }
        
        return new Response(JSON.stringify({ results }), {
          headers: { 
            "content-type": "application/json; charset=UTF-8",
            ...routeCtx.corsHeaders(request.headers.get('Origin'))
          }
        });
      } catch (error) {
        return internalErrorResponse(error, 'Batch processing failed', correlationId);
      }
    }
    
    if (pathname.startsWith('/batch/') && request.method === 'GET') {
      const batchId = pathname.split('/')[2];
      try {
        const status = await getBatchStatus(env, batchId);
        return new Response(JSON.stringify(status), {
          headers: { 
            "content-type": "application/json; charset=UTF-8",
            ...routeCtx.corsHeaders(request.headers.get('Origin'))
          }
        });
      } catch (error) {
        return internalErrorResponse(error, 'Failed to get batch status', correlationId);
      }
    }
  }
  
  // Handle queue-based batch submission
  if (pathname === "/api/queue/submit") {
    if (request.method !== "POST") {
      return badRequest("Only POST supported for queue submit", 405);
    }
    
    // Check basic authentication
    if (!checkAdminAuth(request, env)) {
      return unauthorizedResponse(correlationId);
    }
    
    try {
      // Check request body size (limit to 10MB)
      const contentLength = request.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
        return badRequest('Request body too large. Maximum size is 10MB', 413);
      }
      
      const body = await request.json() as { requests?: unknown };

      if (!body.requests || !Array.isArray(body.requests)) {
        return badRequest("Invalid request body. Expected 'requests' array.", 400);
      }

      const parsedRequests = safeParseBatchLookupRequests(body.requests);
      if (!parsedRequests.success) {
        return badRequest(
          parsedRequests.error.issues.map((e) => e.message).join('; '),
          400,
          'INVALID_BATCH_REQUEST'
        );
      }

      const result = await submitBatchToQueue(env, parsedRequests.data);
      return new Response(JSON.stringify(result), {
        headers: { 
          "content-type": "application/json; charset=UTF-8",
          ...routeCtx.corsHeaders(request.headers.get('Origin'))
        }
      });
    } catch (error) {
      return internalErrorResponse(error, 'Failed to submit batch to queue', correlationId);
    }
  }
  
  // Handle batch status check
  if (pathname === "/api/queue/status") {
    if (request.method !== "GET") {
      return badRequest("Only GET supported for status check", 405);
    }
    
    // Check basic authentication
    if (!checkAdminAuth(request, env)) {
      return unauthorizedResponse(correlationId);
    }
    
    const batchId = url.searchParams.get('batchId');
    if (!batchId) {
      return badRequest("Missing required parameter: batchId", 400);
    }
    
    try {
      const result = await getBatchStatus(env, batchId);
      return new Response(JSON.stringify(result), {
        headers: { 
          "content-type": "application/json; charset=UTF-8",
          ...routeCtx.corsHeaders(request.headers.get('Origin'))
        }
      });
    } catch (error) {
      return internalErrorResponse(error, 'Failed to get batch status', correlationId);
    }
  }
  
  // Handle queue processing (for workers)
  if (pathname === "/api/queue/process") {
    if (request.method !== "POST") {
      return badRequest("Only POST supported for queue processing", 405);
    }
    
    // Check basic authentication
    if (!checkAdminAuth(request, env)) {
      return unauthorizedResponse(correlationId);
    }
    
    try {
      const body = await request.json() as { maxJobs?: number };
      const result = await processQueueJobs(env, body.maxJobs || 10);
      return new Response(JSON.stringify(result), {
        headers: { 
          "content-type": "application/json; charset=UTF-8",
          ...routeCtx.corsHeaders(request.headers.get('Origin'))
        }
      });
    } catch (error) {
      return internalErrorResponse(error, 'Failed to process queue jobs', correlationId);
    }
  }
  
  // Handle queue statistics
  if (pathname === "/api/queue/stats") {
    if (request.method !== "GET") {
      return badRequest("Only GET supported for queue stats", 405);
    }
    
    // Check basic authentication
    if (!checkAdminAuth(request, env)) {
      return unauthorizedResponse(correlationId);
    }
    
    try {
      // Get queue stats from the queue manager
      if (!env.QUEUE_MANAGER) {
        return badRequest("Queue manager not configured", 503);
      }
      
      const stats = await getQueueStats(env);
      return new Response(JSON.stringify(stats), {
        headers: { 
          "content-type": "application/json; charset=UTF-8",
          ...routeCtx.corsHeaders(request.headers.get('Origin'))
        }
      });
    } catch (error) {
      return internalErrorResponse(error, 'Failed to get queue stats', correlationId);
    }
  }
  
  // Queue processing endpoint (legacy)
  if (pathname === '/queue/process' && request.method === 'POST') {
    if (!checkAdminAuth(request, env)) {
      return unauthorizedResponse(correlationId);
    }
    
    try {
      const body = await request.json() as { maxJobs?: number };
      const result = await processQueueJobs(env, body.maxJobs || 10);
      return new Response(JSON.stringify(result), {
        headers: { 
          "content-type": "application/json; charset=UTF-8",
          ...routeCtx.corsHeaders(request.headers.get('Origin'))
        }
      });
    } catch (error) {
      return internalErrorResponse(error, 'Queue processing failed', correlationId);
    }
  }
  
  // Portal → Worker KV projection (operator secret)
  if (pathname.startsWith('/admin/projection/')) {
    return handleProjectionRequest(routeCtx);
  }

  // ODA geolocation endpoints. Rate-limited like the /api catch-all below, but intentionally
  // NOT billed: only 200 lookup/search responses are Billable units today; whether geocode
  // responses become billable is an open pricing decision.
  // The operator credential (BASIC_AUTH) is a secret used for server-to-server bulk work —
  // geocoding an imported household list is exactly that. Throttling it with the per-IP bucket
  // that protects public/browser-key traffic makes a large import fail with 429 partway
  // through, so a valid operator request skips the per-minute limit. Key-based traffic is
  // unaffected and still holds its own daily/provider ceilings.
  if (pathname === '/api/geocode' && request.method === 'GET') {
    const basicAuth = hasValidBasicAuth(request, env);
    if (!basicAuth && !checkRateLimit(env, getClientId(request))) {
      return rateLimitExceededResponse(correlationId);
    }
    const auth = await authorizeLookupRequest(env, request, basicAuth);
    if (!auth.ok) return keyAuthFailureResponse(auth, correlationId);
    return handleGeocodeRoute(routeCtx);
  }

  if (pathname === '/api/reverse' && request.method === 'GET') {
    const basicAuth = hasValidBasicAuth(request, env);
    if (!basicAuth && !checkRateLimit(env, getClientId(request))) {
      return rateLimitExceededResponse(correlationId);
    }
    const auth = await authorizeLookupRequest(env, request, basicAuth);
    if (!auth.ok) return keyAuthFailureResponse(auth, correlationId);
    return handleReverseRoute(routeCtx);
  }

  if (pathname === '/api/normalize-address' && request.method === 'GET') {
    const basicAuth = hasValidBasicAuth(request, env);
    if (!basicAuth && !checkRateLimit(env, getClientId(request))) {
      return rateLimitExceededResponse(correlationId);
    }
    const auth = await authorizeLookupRequest(env, request, basicAuth);
    if (!auth.ok) return keyAuthFailureResponse(auth, correlationId);
    return handleNormalizeAddressRoute(routeCtx);
  }

  // Address autocomplete. Must stay above the /api catch-all below, which would otherwise
  // swallow it and silently serve a federal lookup (pickDataset falls back to federal) --
  // a wrong-but-200 response. Gated on the flag so that when it is off, /api/search falls
  // through to exactly the behaviour it had before this route existed.
  if (
    pathname === '/api/search' &&
    request.method === 'GET' &&
    isOdaSuggestEnabled(env)
  ) {
    // The portal try-it key is public and shared by every visitor, so its daily cap alone
    // would let one abuser exhaust it for everyone. Hold those requests to the stricter
    // per-IP demo rate (own bucket — typing must not starve /api/demo/* riding lookups).
    const isDemoKey =
      !!env.DEMO_BROWSER_API_KEY && extractApiKey(request) === env.DEMO_BROWSER_API_KEY;
    const clientId = isDemoKey
      ? `demo-search:${getClientId(request)}`
      : getClientId(request);
    const searchRateEnv = isDemoKey
      ? { ...env, RATE_LIMIT: parseInt(env.DEMO_RATE_LIMIT || '30', 10) }
      : env;
    if (!hasValidBasicAuth(request, env) && !checkRateLimit(searchRateEnv, clientId)) {
      return rateLimitExceededResponse(correlationId);
    }
    // No checkBasicAuth here: /api/search accepts EITHER basic auth or a browser key, and a
    // hard basic-auth gate would 401 the widget before it could ever present its key.
    // handleSearchRoute owns that decision.
    return handleSearchRoute(routeCtx);
  }

  // Main lookup endpoint
  if (pathname.startsWith('/api')) {
    const clientId = getClientId(request);
    const basicAuth = hasValidBasicAuth(request, env);
    if (!basicAuth && !checkRateLimit(env, clientId)) {
      return rateLimitExceededResponse(correlationId);
    }

    const auth = await authorizeLookupRequest(env, request, basicAuth);
    if (!auth.ok) return keyAuthFailureResponse(auth, correlationId);

    // The catch-all still owns its own auth until it is ported; thread the resolved billing
    // context through the same field the prelude fills for ported lookup entries.
    return handleLookupRequest({ ...routeCtx, billing: billingFromAuth(auth) });
  }
  
  return badRequest("Not found", 404, "NOT_FOUND", correlationId)
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now();
    const correlationId = getCorrelationId(request);
    incrementMetric('requestCount');

    // Initialize circuit breakers with environment (for Durable Object support)
    if (!geocodingCircuitBreaker || !r2CircuitBreaker) {
      initializeCircuitBreakers(env);
    }

    try {
      // Build the one request context up front; the prelude fills auth, rate-limit and headers
      // for ported entries, and the legacy fallback receives the same complete object.
      const routeCtx = createRouteContext({ request, env, ctx, correlationId, startTime });

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        const origin = request.headers.get('Origin');
        return new Response(null, {
          status: 200,
          headers: routeCtx.corsHeaders(origin)
        });
      }

      return await dispatch(routeCtx, legacyFetch);
    } catch (err: unknown) {
      incrementMetric('errorCount');
      recordTiming('totalLookupTime', Date.now() - startTime);
      // Generic body: internal error messages (stack context, binding names, R2 keys) must not
      // reach clients. The real error is logged with the correlation ID for tracing.
      return internalErrorResponse(err, 'Unexpected error', correlationId, 'UNEXPECTED_ERROR');
    }
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Initialize circuit breakers with environment (for Durable Object support)
    // This is needed because scheduled events can fire before any HTTP request
    if (!geocodingCircuitBreaker || !r2CircuitBreaker) {
      initializeCircuitBreakers(env);
    }
    
    await handleScheduled(event, env, ctx);
  }
};

// Export Durable Objects
export { QueueManagerDO };
export { CircuitBreakerDO };
export { ApiKeyUsageDO };

