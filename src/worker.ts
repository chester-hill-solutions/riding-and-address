/// <reference types="@cloudflare/workers-types" />

import {
  Env
} from './types';
import { geocodeIfNeeded, geocodeBatch } from './geocoding';
import {
  handleGeocodeRoute,
  handleReverseRoute,
  handleNormalizeAddressRoute,
  handleOdaInit,
  handleOdaStats,
  handleSearchRoute,
} from './oda-handlers';
import { isOdaSuggestEnabled } from './oda-config';
import { createEmbedScript, EMBED_VERSION } from './embed';
import {
  performCacheWarming,
  getCacheWarmingStatus
} from './cache';
import { geocodingExecutor, geocodingCircuitBreaker, initializeCircuitBreakers, r2CircuitBreaker } from './circuit-breaker';
import { incrementMetric, recordTiming, getMetrics, getMetricsSummary } from './metrics';
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
import { checkRidingDatasets, allRequiredDatasetsPresent, missingDatasetKeys, getAllR2Keys } from './datasets';
import { createLookupRequestScope, handleLookupRequest } from './lookup-handler';
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
  initializeWebhookProcessing, 
  getAllWebhooks,
  getWebhookEvents,
  getWebhookDeliveries,
  createWebhook,
  processWebhookEvents,
  cleanupWebhookData
} from './webhooks';
import { 
  processBatchLookupWithBatchGeocoding,
  submitBatchToQueue,
  getBatchStatus,
  processQueueJobs
} from './batch';
import { safeParseBatchLookupRequests } from './validation';
import { QueueManagerDO } from './queue-manager';
import { ApiKeyUsageDO } from './api-key-usage-do';
import { CircuitBreakerDO } from './circuit-breaker-do';
import { createApiReference, createOpenAPISpec } from './docs';
import { TIME_CONSTANTS } from './config';
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
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now();
    const correlationId = getCorrelationId(request);
    incrementMetric('requestCount');
    
    // Initialize circuit breakers with environment (for Durable Object support)
    if (!geocodingCircuitBreaker || !r2CircuitBreaker) {
      initializeCircuitBreakers(env);
    }
    
    // Note: Cache warming is now handled by Cloudflare Cron Triggers
    // See wrangler.jsonc for cron configuration
    
    // Initialize webhook processing
    initializeWebhookProcessing(env);
    
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;
      
      const scope = createLookupRequestScope(env, request, ctx, correlationId, startTime);

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        const origin = request.headers.get('Origin');
        return new Response(null, {
          status: 200,
          headers: scope.corsHeaders(origin)
        });
      }
      
      // GET "/" is owned by the portal (see workers/app.ts) — the API worker never sees it in
      // the combined deploy, but keep a safe fallback for direct/standalone use of this Worker.
      if (pathname === "/") {
        return badRequest("Not found — see /docs", 404, "NOT_FOUND", correlationId);
      }

      // Handle OpenAPI docs
      if (pathname === "/api/docs") {
        const baseUrl = `${url.protocol}//${url.host}`;
        return new Response(JSON.stringify(createOpenAPISpec(baseUrl)), {
          headers: { 
            "content-type": "application/json; charset=UTF-8",
            ...scope.corsHeaders(request.headers.get('Origin'))
          }
        });
      }

      // Handle interactive API reference (Scalar)
      if (
        pathname === "/docs" ||
        pathname === "/api/docs/ui" ||
        pathname === "/api/swagger" ||
        pathname === "/swagger"
      ) {
        const baseUrl = `${url.protocol}//${url.host}`;
        return new Response(createApiReference(baseUrl), {
          headers: {
            "content-type": "text/html; charset=UTF-8",
            ...scope.corsHeaders(request.headers.get('Origin'))
          }
        });
      }
      
      // Health check endpoint (public liveness; detailed diagnostics require admin auth)
      if (pathname === '/health') {
        if (!checkAdminAuth(request, env)) {
          return new Response(JSON.stringify({
            status: 'healthy',
            timestamp: Date.now(),
          }), {
            headers: {
              "content-type": "application/json; charset=UTF-8",
              ...scope.corsHeaders(request.headers.get('Origin'))
            }
          });
        }

        const metrics = getMetrics();
        const circuitBreakerStates = {
          geocodingOda: await geocodingCircuitBreaker.getStateInfo('geocoding:oda'),
          geocodingNominatim: await geocodingCircuitBreaker.getStateInfo('geocoding:nominatim'),
          r2: await r2CircuitBreaker.getStateInfo('r2:federalridings-2024.geojson'),
        };
        const datasets = await checkRidingDatasets(env);
        const datasetsOk = allRequiredDatasetsPresent(datasets);
        const missingDatasets = missingDatasetKeys(datasets);

        return new Response(JSON.stringify({
          status: datasetsOk ? 'healthy' : 'unhealthy',
          timestamp: Date.now(),
          metrics,
          circuitBreakers: circuitBreakerStates,
          cacheWarming: getCacheWarmingStatus(),
          datasets,
          ...(missingDatasets.length > 0 && { missingDatasets }),
        }), {
          headers: {
            "content-type": "application/json; charset=UTF-8",
            ...scope.corsHeaders(request.headers.get('Origin'))
          }
        });
      }

      // Admin circuit breaker reset
      if (pathname === '/admin/circuit-breaker/reset' && request.method === 'POST') {
        if (!checkAdminAuth(request, env)) {
          return unauthorizedResponse(correlationId);
        }

        const key = url.searchParams.get('key');
        if (key) {
          if (key.startsWith('r2:')) {
            await r2CircuitBreaker.reset(key);
          } else {
            await geocodingCircuitBreaker.reset(key);
          }
          return new Response(JSON.stringify({ success: true, message: `Circuit breaker ${key} reset` }), {
            headers: {
              'content-type': 'application/json; charset=UTF-8',
              ...scope.corsHeaders(request.headers.get('Origin')),
            },
          });
        }

        await geocodingCircuitBreaker.resetAll();
        return new Response(JSON.stringify({ success: true, message: 'All circuit breakers reset' }), {
          headers: {
            'content-type': 'application/json; charset=UTF-8',
            ...scope.corsHeaders(request.headers.get('Origin')),
          },
        });
      }

      // Metrics endpoint
      if (pathname === '/metrics') {
        if (!checkAdminAuth(request, env)) {
          return unauthorizedResponse(correlationId);
        }

        const metrics = getMetricsSummary();
        return new Response(JSON.stringify(metrics), {
          headers: {
            "content-type": "application/json; charset=UTF-8",
            ...scope.corsHeaders(request.headers.get('Origin'))
          }
        });
      }

      // Webhook management endpoints
      if (pathname.startsWith('/webhooks')) {
        if (!checkAdminAuth(request, env)) {
          return unauthorizedResponse(correlationId);
        }
        
        if (pathname === '/webhooks' && request.method === 'GET') {
          const webhooksMap = await getAllWebhooks(env);
          const webhooks = Array.from(webhooksMap.entries()).map(([id, config]) => ({
            id,
            url: config.url,
            events: config.events,
            active: config.active,
            createdAt: config.createdAt,
            lastDelivery: config.lastDelivery,
            failureCount: config.failureCount
          }));
          
          return new Response(JSON.stringify({ webhooks }), {
            headers: { 
              "content-type": "application/json; charset=UTF-8",
              ...scope.corsHeaders(request.headers.get('Origin'))
            }
          });
        }
        
        if (pathname === '/webhooks/events' && request.method === 'GET') {
          const events = await getWebhookEvents(env);
          return new Response(JSON.stringify({ events }), {
            headers: { 
              "content-type": "application/json; charset=UTF-8",
              ...scope.corsHeaders(request.headers.get('Origin'))
            }
          });
        }
        
        if (pathname === '/webhooks/deliveries' && request.method === 'GET') {
          const deliveries = await getWebhookDeliveries(env);
          return new Response(JSON.stringify({ deliveries }), {
            headers: { 
              "content-type": "application/json; charset=UTF-8",
              ...scope.corsHeaders(request.headers.get('Origin'))
            }
          });
        }
      }
      
      // Cache warming status endpoint
      if (pathname === '/cache-warming' && request.method === 'GET') {
        if (!checkAdminAuth(request, env)) {
          return unauthorizedResponse(correlationId);
        }

        const status = getCacheWarmingStatus();
        return new Response(JSON.stringify({
          ...status,
          config: {
            enabled: true,
            interval: TIME_CONSTANTS.SIX_HOURS_MS,
            batchSize: 5
          }
        }), {
          headers: { 
            "content-type": "application/json; charset=UTF-8",
            ...scope.corsHeaders(request.headers.get('Origin'))
          }
        });
      }
      
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
                ...scope.corsHeaders(request.headers.get('Origin'))
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
                ...scope.corsHeaders(request.headers.get('Origin'))
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
                ...scope.corsHeaders(request.headers.get('Origin'))
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
                ...scope.corsHeaders(request.headers.get('Origin'))
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
                ...scope.corsHeaders(request.headers.get('Origin'))
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
                  ...scope.corsHeaders(request.headers.get('Origin'))
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
              ...scope.corsHeaders(request.headers.get('Origin'))
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
              ...scope.corsHeaders(request.headers.get('Origin'))
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
                ...scope.corsHeaders(request.headers.get('Origin'))
              }
            });
          } catch (error) {
            return internalErrorResponse(error, 'Cache warming failed', correlationId);
          }
        } else {
          return badRequest("Method not allowed", 405);
        }
      }
      
      // Handle webhook management endpoints
      if (pathname.startsWith('/api/webhooks')) {
        if (pathname === '/api/webhooks' && request.method === 'GET') {
          if (!checkAdminAuth(request, env)) {
            return unauthorizedResponse(correlationId);
          }
          
          const webhooksMap = await getAllWebhooks(env);
          const webhooks = Array.from(webhooksMap.entries()).map(([id, config]) => ({
            id,
            url: config.url,
            events: config.events,
            secret: config.secret ? '***' : undefined,
            createdAt: config.createdAt,
            lastDelivery: config.lastDelivery,
            failureCount: config.failureCount,
            maxFailures: config.maxFailures,
            active: config.active
          }));
          
          return new Response(JSON.stringify({ webhooks }), {
            headers: { 
              "content-type": "application/json; charset=UTF-8",
              ...scope.corsHeaders(request.headers.get('Origin'))
            }
          });
        }
        
        if (pathname === '/api/webhooks' && request.method === 'POST') {
          if (!checkAdminAuth(request, env)) {
            return unauthorizedResponse(correlationId);
          }
          
          try {
            const body = await request.json() as { url: string; events: string[]; secret?: string };
            const webhookId = await createWebhook(env, {
              url: body.url,
              events: body.events,
              secret: body.secret || '',
              active: true
            });
            
            return new Response(JSON.stringify({
              webhookId,
              message: "Webhook created successfully"
            }), {
              headers: { 
                "content-type": "application/json; charset=UTF-8",
                ...scope.corsHeaders(request.headers.get('Origin'))
              }
            });
          } catch (error) {
            return internalErrorResponse(error, 'Failed to create webhook', correlationId);
          }
        }
        
        if (pathname === '/api/webhooks/events' && request.method === 'GET') {
          if (!checkAdminAuth(request, env)) {
            return unauthorizedResponse(correlationId);
          }
          
          const url = new URL(request.url);
          const status = url.searchParams.get('status');
          const webhookId = url.searchParams.get('webhookId');
          
          const events = await getWebhookEvents(env, webhookId || undefined);
          const filteredEvents = status ? events.filter(e => e.status === status) : events;
          
          return new Response(JSON.stringify({ events: filteredEvents }), {
            headers: { 
              "content-type": "application/json; charset=UTF-8",
              ...scope.corsHeaders(request.headers.get('Origin'))
            }
          });
        }
        
        if (pathname === '/api/webhooks/deliveries' && request.method === 'GET') {
          if (!checkAdminAuth(request, env)) {
            return unauthorizedResponse(correlationId);
          }
          
          const url = new URL(request.url);
          const webhookId = url.searchParams.get('webhookId');
          const status = url.searchParams.get('status');
          
          const deliveries = await getWebhookDeliveries(env, webhookId || undefined);
          const filteredDeliveries = status ? deliveries.filter(d => d.status === status) : deliveries;
          
          return new Response(JSON.stringify({ deliveries: filteredDeliveries }), {
            headers: { 
              "content-type": "application/json; charset=UTF-8",
              ...scope.corsHeaders(request.headers.get('Origin'))
            }
          });
        }
        
        return badRequest("Webhook endpoint not found", 404);
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

            const cb = geocodingExecutor();
            const results = await processBatchLookupWithBatchGeocoding(
              env,
              parsedRequests.data,
              geocodeIfNeeded,
              lookupRiding,
              (e, q, req?, c?) => geocodeBatch(e, q, req, undefined, c ?? cb),
              request,
              cb
            );

            // Same Billable unit as realtime: each successful item without error.
            // Once the fuse denies an increment, redact that item and all remaining
            // successes so results are not returned free past the hard fuse.
            if (batchBilling) {
              let fuseExceeded = false;
              for (const item of results) {
                if (item.error) continue;
                if (fuseExceeded) {
                  item.properties = null;
                  item.riding = undefined;
                  item.province_data = undefined;
                  item.error = 'Monthly usage fuse exceeded';
                  continue;
                }
                const billed = await recordSuccessfulBillable(env, batchBilling, {
                  waitUntil: (task) => ctx.waitUntil(task),
                });
                if (!billed.allowed) {
                  fuseExceeded = true;
                  item.properties = null;
                  item.riding = undefined;
                  item.province_data = undefined;
                  item.error =
                    typeof billed.body?.error === 'string'
                      ? billed.body.error
                      : 'Monthly usage fuse exceeded';
                }
              }
            }
            
            return new Response(JSON.stringify({ results }), {
              headers: { 
                "content-type": "application/json; charset=UTF-8",
                ...scope.corsHeaders(request.headers.get('Origin'))
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
                ...scope.corsHeaders(request.headers.get('Origin'))
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
              ...scope.corsHeaders(request.headers.get('Origin'))
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
              ...scope.corsHeaders(request.headers.get('Origin'))
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
              ...scope.corsHeaders(request.headers.get('Origin'))
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
              ...scope.corsHeaders(request.headers.get('Origin'))
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
              ...scope.corsHeaders(request.headers.get('Origin'))
            }
          });
        } catch (error) {
          return internalErrorResponse(error, 'Queue processing failed', correlationId);
        }
      }
      
      // ODA geolocation admin endpoints
      if (pathname.startsWith('/api/oda')) {
        if (pathname === '/api/oda/init' && request.method === 'POST') {
          if (!checkAdminAuth(request, env)) {
            return unauthorizedResponse(correlationId);
          }
          try {
            return await handleOdaInit(env);
          } catch (error) {
            return internalErrorResponse(error, 'ODA initialization failed', correlationId);
          }
        }

        if (pathname === '/api/oda/stats' && request.method === 'GET') {
          if (!checkAdminAuth(request, env)) {
            return unauthorizedResponse(correlationId);
          }
          try {
            return await handleOdaStats(env);
          } catch (error) {
            return internalErrorResponse(error, 'Failed to get ODA stats', correlationId);
          }
        }
      }

      // Drop-in autocomplete widget. Gated with /api/search: a widget whose only data source is
      // unregistered would fail silently on the integrator's page, which is worse than a 404.
      if (pathname === '/embed.js' && request.method === 'GET') {
        if (!isOdaSuggestEnabled(env)) {
          return badRequest('Address autocomplete is not enabled', 404, 'NOT_FOUND', correlationId);
        }
        return new Response(createEmbedScript(new URL(request.url).origin), {
          headers: {
            'content-type': 'application/javascript; charset=UTF-8',
            'Cache-Control': 'public, max-age=300, s-maxage=3600',
            'X-Embed-Version': EMBED_VERSION,
            ...scope.corsHeaders(request.headers.get('Origin')),
          },
        });
      }

      // Portal → Worker KV projection (operator secret)
      if (pathname.startsWith('/admin/projection/')) {
        return handleProjectionRequest(request, env, pathname);
      }

      // Public demo routes — no Customer key; IP rate-limited; not billable
      if (pathname.startsWith('/api/demo/') && request.method === 'GET') {
        const demoLimit = parseInt(env.DEMO_RATE_LIMIT || '30', 10);
        const demoClient = `demo:${getClientId(request)}`;
        if (!checkRateLimit({ ...env, RATE_LIMIT: demoLimit }, demoClient)) {
          return rateLimitExceededResponse(correlationId);
        }
        const demoPath = pathname.replace(/^\/api\/demo/, '/api') || '/api';
        if (demoPath === '/api/geocode') return handleGeocodeRoute(request, env);
        if (demoPath === '/api/reverse') return handleReverseRoute(request, env);
        if (demoPath === '/api/normalize-address') return handleNormalizeAddressRoute(request, env);
        return handleLookupRequest(
          scope,
          request,
          demoPath === '/api' ? '/api/federal' : demoPath
        );
      }

      // ODA geolocation endpoints. Rate-limited like the /api catch-all below, but intentionally
      // NOT billed: only 200 lookup/search responses are Billable units today; whether geocode
      // responses become billable is an open pricing decision.
      if (pathname === '/api/geocode' && request.method === 'GET') {
        if (!checkRateLimit(env, getClientId(request))) {
          return rateLimitExceededResponse(correlationId);
        }
        const auth = await authorizeLookupRequest(env, request, hasValidBasicAuth(request, env));
        if (!auth.ok) return keyAuthFailureResponse(auth, correlationId);
        const response = await handleGeocodeRoute(request, env);
        return response;
      }

      if (pathname === '/api/reverse' && request.method === 'GET') {
        if (!checkRateLimit(env, getClientId(request))) {
          return rateLimitExceededResponse(correlationId);
        }
        const auth = await authorizeLookupRequest(env, request, hasValidBasicAuth(request, env));
        if (!auth.ok) return keyAuthFailureResponse(auth, correlationId);
        return handleReverseRoute(request, env);
      }

      if (pathname === '/api/normalize-address' && request.method === 'GET') {
        if (!checkRateLimit(env, getClientId(request))) {
          return rateLimitExceededResponse(correlationId);
        }
        const auth = await authorizeLookupRequest(env, request, hasValidBasicAuth(request, env));
        if (!auth.ok) return keyAuthFailureResponse(auth, correlationId);
        return handleNormalizeAddressRoute(request, env);
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
        if (!checkRateLimit(searchRateEnv, clientId)) {
          return rateLimitExceededResponse(correlationId);
        }
        // No checkBasicAuth here: /api/search accepts EITHER basic auth or a browser key, and a
        // hard basic-auth gate would 401 the widget before it could ever present its key.
        // handleSearchRoute owns that decision.
        return handleSearchRoute(scope, request);
      }

      // Main lookup endpoint
      if (pathname.startsWith('/api')) {
        const clientId = getClientId(request);
        if (!checkRateLimit(env, clientId)) {
          return rateLimitExceededResponse(correlationId);
        }

        const auth = await authorizeLookupRequest(env, request, hasValidBasicAuth(request, env));
        if (!auth.ok) return keyAuthFailureResponse(auth, correlationId);

        return handleLookupRequest(
          scope,
          request,
          pathname,
          billingFromAuth(auth)
        );
      }
      
      return badRequest("Not found", 404, "NOT_FOUND", correlationId)
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

