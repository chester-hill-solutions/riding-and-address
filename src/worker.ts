/// <reference types="@cloudflare/workers-types" />

import { Env, LookupResult, GeoJSONFeatureCollection, SpatialIndex, GeoJSONFeature } from './types';
import { geocodeIfNeeded, geocodeBatch } from './geocoding';
import {
  handleGeocodeRoute,
  handleReverseRoute,
  handleNormalizeAddressRoute,
  handleOdaInit,
  handleOdaStats,
} from './oda-handlers';
import { 
  geoCacheLRU, 
  spatialIndexCacheLRU, 
  setCachedGeoJSON, 
  setCachedSpatialIndex,
  performCacheWarming,
  getCacheWarmingStatus,
} from './cache';
import { initializeCircuitBreakers, geocodingCircuitBreaker, r2CircuitBreaker } from './circuit-breaker';
import { incrementMetric, recordTiming, getMetrics, getMetricsSummary } from './metrics';
import { 
  isPointInPolygon, 
  withTimeout, 
  withRetry, 
  pickDataset, 
  ridingNameFromProperties,
  checkBasicAuth,
  checkAdminAuth, 
  badRequest, 
  unauthorizedResponse, 
  rateLimitExceededResponse,
  checkRateLimit,
  getClientId,
  getCorrelationId,
} from './utils';
import { handleLookupRequest } from './lookup-handler';
import { resolveLookupPath } from './return-selector';
import {
  checkRidingDatasets,
  allRequiredDatasetsPresent,
  missingDatasetKeys,
} from './datasets';
import { 
  createSpatialIndex, 
  findCandidateFeatures, 
  isPointInBoundingBox,
  queryRidingFromDatabase,
  initializeSpatialDatabase,
  getAllFeaturesFromDatabase,
  syncGeoJSONToDatabase,
  getSpatialDbConfig
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
import { CircuitBreakerDO } from './circuit-breaker-do';
import { createLandingPage, createApiReference, createOpenAPISpec } from './docs';
import { getTimeoutConfig, getRetryConfig, TIME_CONSTANTS } from './config';

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

// Main lookup function
async function lookupRiding(env: Env, pathname: string, lon: number, lat: number): Promise<LookupResult> {
  const timeoutConfig = getTimeoutConfig(env);
  const timeoutMs = timeoutConfig.lookup;
  
  const lookupPromise = (async () => {
    const { r2Key } = pickDataset(pathname);
    
    // Try spatial database first if enabled
    const dbConfig = getSpatialDbConfig(env);
    if (dbConfig.ENABLED && env.RIDING_DB) {
      try {
        const dbResult = await queryRidingFromDatabase(env, r2Key, lon, lat);
        if (dbResult) {
          return {
            riding: ridingNameFromProperties(dbResult.properties) ?? 'Unknown',
            properties: dbResult.properties || {}
          };
        }
      } catch (error) {
        console.warn('Database lookup failed, falling back to spatial index:', error);
      }
    }
    
    // Check LRU cache
    let spatialIndex = spatialIndexCacheLRU.get(r2Key);
    
    if (!spatialIndex) {
        // Load GeoJSON to create spatial index
        await loadGeo(env, r2Key);
        spatialIndex = spatialIndexCacheLRU.get(r2Key);
        if (!spatialIndex) throw new Error(`Failed to create spatial index for ${r2Key}`);
    }
    
    return lookupRidingWithIndex(spatialIndex, lon, lat);
  })();

  return withTimeout(lookupPromise, timeoutMs, "Riding lookup");
}

// Load GeoJSON data from R2
async function loadGeo(env: Env, key: string): Promise<GeoJSONFeatureCollection> {
  const startTime = Date.now();
  incrementMetric('r2Requests');
  
  // Check LRU cache
  const cached = geoCacheLRU.get(key);
  if (cached) {
    incrementMetric('r2CacheHits');
    recordTiming('totalR2Time', Date.now() - startTime);
    return cached;
  }

  incrementMetric('r2CacheMisses');
  
  try {
    const geo = await r2CircuitBreaker.execute(`r2:${key}`, async () => {
      const retryConfig = getRetryConfig();
      return await withRetry(async () => {
        const obj = await env.RIDINGS.get(key);
        if (!obj) throw new Error(`R2 object not found: ${key}`);
        const text = await obj.text();
        const parsed = JSON.parse(text) as GeoJSONFeatureCollection;
        
        // Validate GeoJSON structure
        if (!parsed || typeof parsed !== 'object') {
          throw new Error(`Invalid GeoJSON: not an object`);
        }
        if (parsed.type !== 'FeatureCollection') {
          throw new Error(`Invalid GeoJSON: expected FeatureCollection, got ${parsed.type}`);
        }
        if (!Array.isArray(parsed.features)) {
          throw new Error(`Invalid GeoJSON: features must be an array`);
        }
        
        // Validate features structure
        for (let i = 0; i < Math.min(parsed.features.length, 10); i++) {
          const feature = parsed.features[i];
          if (!feature || typeof feature !== 'object') {
            throw new Error(`Invalid GeoJSON: feature ${i} is not an object`);
          }
          if (feature.type !== 'Feature') {
            throw new Error(`Invalid GeoJSON: feature ${i} type is not 'Feature'`);
          }
          if (!feature.geometry || typeof feature.geometry !== 'object') {
            throw new Error(`Invalid GeoJSON: feature ${i} missing or invalid geometry`);
          }
          if (!feature.geometry.coordinates || !Array.isArray(feature.geometry.coordinates)) {
            throw new Error(`Invalid GeoJSON: feature ${i} missing or invalid coordinates`);
          }
        }
        
        return parsed;
      }, retryConfig, `R2 fetch ${key}`);
    });
    
    // Cache the result
    setCachedGeoJSON(key, geo);
    
    // Create spatial index
    const spatialIndex = createSpatialIndex(geo);
    setCachedSpatialIndex(key, spatialIndex);
    
    incrementMetric('r2Successes');
    recordTiming('totalR2Time', Date.now() - startTime);
    return geo;
  } catch (error) {
    incrementMetric('r2Failures');
    if (error instanceof Error && error.message.includes('Circuit breaker is OPEN')) {
      incrementMetric('r2CircuitBreakerTrips');
    }
    recordTiming('totalR2Time', Date.now() - startTime);
    throw error;
  }
}

// Lookup riding using spatial index
function lookupRidingWithIndex(spatialIndex: SpatialIndex, lon: number, lat: number): LookupResult {
  const startTime = Date.now();
  
  // First check if point is within the overall bounding box
  if (!isPointInBoundingBox(lon, lat, spatialIndex.boundingBox)) {
    incrementMetric('spatialIndexHits');
    recordTiming('totalSpatialIndexTime', Date.now() - startTime);
    return { properties: null };
  }
  
  // Find candidate features using spatial index
  const candidates = findCandidateFeatures(lon, lat, spatialIndex);
  
  if (candidates.length === 0) {
    incrementMetric('spatialIndexHits');
    recordTiming('totalSpatialIndexTime', Date.now() - startTime);
    return { properties: null };
  }
  
  incrementMetric('spatialIndexMisses');
  
  // Only test point-in-polygon for candidates
  for (const feat of candidates) {
    const props = featurePropertiesIfContains(feat, lon, lat);
    if (props) {
      recordTiming('totalSpatialIndexTime', Date.now() - startTime);
      return {
        properties: props,
        riding: ridingNameFromProperties(props),
      };
    }
  }
  
  recordTiming('totalSpatialIndexTime', Date.now() - startTime);
  return { properties: null };
}

// Check if point is in polygon and return properties
function featurePropertiesIfContains(ridingFeature: GeoJSONFeature, lon: number, lat: number): Record<string, unknown> | null {
  const geom = ridingFeature?.geometry;
  if (!geom) return null;
  if (isPointInPolygon(lon, lat, geom)) {
    return ridingFeature?.properties || {};
  }
  return null;
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
 * - GET /api, /api/qc, /api/on - Riding lookup endpoints
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
      
      // CORS configuration - can be customized per endpoint
      const getCorsHeaders = (origin?: string | null): Record<string, string> => {
        // Allow all origins by default, but can be restricted per endpoint
        const allowedOrigin = origin || '*';
        return {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Google-API-Key, X-Correlation-ID, X-Request-ID',
          'Access-Control-Max-Age': '86400',
          'X-Correlation-ID': correlationId
        };
      };
      
      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        const origin = request.headers.get('Origin');
        return new Response(null, {
          status: 200,
          headers: getCorsHeaders(origin)
        });
      }
      
      // Handle landing page
      if (pathname === "/") {
        const baseUrl = `${url.protocol}//${url.host}`;
        return new Response(createLandingPage(baseUrl), {
          headers: { 
            "content-type": "text/html; charset=UTF-8",
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
      
      // Handle OpenAPI docs
      if (pathname === "/api/docs") {
        const baseUrl = `${url.protocol}//${url.host}`;
        return new Response(JSON.stringify(createOpenAPISpec(baseUrl)), {
          headers: { 
            "content-type": "application/json; charset=UTF-8",
            'Access-Control-Allow-Origin': '*'
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
            'Access-Control-Allow-Origin': '*'
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
              'Access-Control-Allow-Origin': '*'
            }
          });
        }

        const metrics = getMetrics();
        const circuitBreakerStates = {
          geocoding: await geocodingCircuitBreaker.getStateInfo('geocoding:nominatim'),
          r2: await r2CircuitBreaker.getStateInfo('r2:federalridings-2024.geojson')
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
            'Access-Control-Allow-Origin': '*'
          }
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
            'Access-Control-Allow-Origin': '*'
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
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        
        if (pathname === '/webhooks/events' && request.method === 'GET') {
          const events = await getWebhookEvents(env);
          return new Response(JSON.stringify({ events }), {
            headers: { 
              "content-type": "application/json; charset=UTF-8",
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        
        if (pathname === '/webhooks/deliveries' && request.method === 'GET') {
          const deliveries = await getWebhookDeliveries(env);
          return new Response(JSON.stringify({ deliveries }), {
            headers: { 
              "content-type": "application/json; charset=UTF-8",
              'Access-Control-Allow-Origin': '*'
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
            'Access-Control-Allow-Origin': '*'
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
                'Access-Control-Allow-Origin': '*'
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Database initialization failed",
              500
            );
          }
        }
        
        if (pathname === '/api/database/sync' && request.method === 'POST') {
          if (!checkAdminAuth(request, env)) {
            return unauthorizedResponse(correlationId);
          }
          
          try {
            const body = await request.json() as { dataset?: string };
            const dataset = body.dataset || 'federalridings-2024.geojson';
            
            const success = await syncGeoJSONToDatabase(env, dataset, loadGeo);
            return new Response(JSON.stringify({
              success,
              message: success ? `Database synced for ${dataset}` : "Database sync failed",
              dataset
            }), {
              headers: { 
                "content-type": "application/json; charset=UTF-8",
                'Access-Control-Allow-Origin': '*'
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Database sync failed",
              500
            );
          }
        }
        
        if (pathname === '/api/database/stats' && request.method === 'GET') {
          if (!checkAdminAuth(request, env)) {
            return unauthorizedResponse(correlationId);
          }
          
          try {
            // This would need to be implemented to get actual database stats
            const dbConfig = getSpatialDbConfig(env);
            return new Response(JSON.stringify({
              enabled: dbConfig.ENABLED,
              features: 0, // Would need actual count
              lastSync: null, // Would need actual timestamp
              status: dbConfig.ENABLED ? "active" : "disabled"
            }), {
              headers: { 
                "content-type": "application/json; charset=UTF-8",
                'Access-Control-Allow-Origin': '*'
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Failed to get database stats",
              500
            );
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
                'Access-Control-Allow-Origin': '*'
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Database query failed",
              500
            );
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
                'Access-Control-Allow-Origin': '*'
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Boundaries lookup failed",
              500
            );
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
                  'Access-Control-Allow-Origin': '*'
                }
              });
            } else {
              return badRequest('Spatial database not enabled', 503);
            }
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Failed to get boundaries",
              500
            );
          }
        }
        
        if (pathname === '/api/boundaries/config' && request.method === 'GET') {
          const dbConfig = getSpatialDbConfig(env);
          return new Response(JSON.stringify({
            enabled: dbConfig.ENABLED,
            useRtreeIndex: dbConfig.USE_RTREE_INDEX,
            batchInsertSize: dbConfig.BATCH_INSERT_SIZE,
            datasets: ['federalridings-2024.geojson', 'quebecridings-2025.geojson', 'ontarioridings-2022.geojson']
          }), {
            headers: { 
              "content-type": "application/json; charset=UTF-8",
              'Access-Control-Allow-Origin': '*'
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
              'Access-Control-Allow-Origin': '*'
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
              } else if (location.postal) {
                console.log(`Cache warming for postal code: ${location.postal}`);
              }
            }
            
            return new Response(JSON.stringify({
              message: "Cache warming initiated",
              locations: locations.length,
              timestamp: Date.now()
            }), {
              headers: { 
                "content-type": "application/json; charset=UTF-8",
                'Access-Control-Allow-Origin': '*'
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Cache warming failed",
              500
            );
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
              'Access-Control-Allow-Origin': '*'
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
                'Access-Control-Allow-Origin': '*'
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Failed to create webhook",
              500
            );
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
              'Access-Control-Allow-Origin': '*'
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
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        
        return badRequest("Webhook endpoint not found", 404);
      }
      
      // Batch processing endpoints
      if (pathname.startsWith('/batch')) {
        if (!checkAdminAuth(request, env)) {
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
                parsedRequests.error.errors.map((e) => e.message).join('; '),
                400,
                'INVALID_BATCH_REQUEST'
              );
            }

            const cb = geocodingCircuitBreaker ? { execute: (k: string, fn: () => Promise<unknown>) => geocodingCircuitBreaker!.execute(k, fn) } : undefined;
            const results = await processBatchLookupWithBatchGeocoding(
              env,
              parsedRequests.data,
              geocodeIfNeeded,
              lookupRiding,
              (e, q, req?, c?) => geocodeBatch(e, q, req, undefined, c ?? cb),
              request,
              cb
            );
            
            return new Response(JSON.stringify({ results }), {
              headers: { 
                "content-type": "application/json; charset=UTF-8",
                'Access-Control-Allow-Origin': '*'
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Batch processing failed",
              500
            );
          }
        }
        
        if (pathname.startsWith('/batch/') && request.method === 'GET') {
          const batchId = pathname.split('/')[2];
          try {
            const status = await getBatchStatus(env, batchId);
            return new Response(JSON.stringify(status), {
              headers: { 
                "content-type": "application/json; charset=UTF-8",
                'Access-Control-Allow-Origin': '*'
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Failed to get batch status",
              500
            );
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
              parsedRequests.error.errors.map((e) => e.message).join('; '),
              400,
              'INVALID_BATCH_REQUEST'
            );
          }

          const result = await submitBatchToQueue(env, parsedRequests.data);
          return new Response(JSON.stringify(result), {
            headers: { 
              "content-type": "application/json; charset=UTF-8",
              'Access-Control-Allow-Origin': '*'
            }
          });
        } catch (error) {
          return badRequest(
            error instanceof Error ? error.message : "Failed to submit batch to queue",
            500
          );
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
              'Access-Control-Allow-Origin': '*'
            }
          });
        } catch (error) {
          return badRequest(
            error instanceof Error ? error.message : "Failed to get batch status",
            500
          );
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
              'Access-Control-Allow-Origin': '*'
            }
          });
        } catch (error) {
          return badRequest(
            error instanceof Error ? error.message : "Failed to process queue jobs",
            500
          );
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
          
          const queueManagerId = env.QUEUE_MANAGER.idFromName("main-queue");
          const queueManager = env.QUEUE_MANAGER.get(queueManagerId);
          const response = await queueManager.fetch(new Request("https://queue.local/queue/stats"));
          
          if (!response.ok) {
            const error = await response.json() as { error?: string };
            throw new Error(error.error || "Failed to get queue stats");
          }
          
          const stats = await response.json();
          return new Response(JSON.stringify(stats), {
            headers: { 
              "content-type": "application/json; charset=UTF-8",
              'Access-Control-Allow-Origin': '*'
            }
          });
        } catch (error) {
          return badRequest(
            error instanceof Error ? error.message : "Failed to get queue stats",
            500
          );
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
              'Access-Control-Allow-Origin': '*'
            }
          });
        } catch (error) {
          return badRequest(
            error instanceof Error ? error.message : "Queue processing failed",
            500
          );
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
            return badRequest(
              error instanceof Error ? error.message : 'ODA initialization failed',
              500
            );
          }
        }

        if (pathname === '/api/oda/stats' && request.method === 'GET') {
          if (!checkAdminAuth(request, env)) {
            return unauthorizedResponse(correlationId);
          }
          try {
            return await handleOdaStats(env);
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : 'Failed to get ODA stats',
              500
            );
          }
        }
      }

      // ODA geolocation endpoints
      if (pathname === '/api/geocode' && request.method === 'GET') {
        if (!checkBasicAuth(request, env)) {
          return unauthorizedResponse(correlationId);
        }
        return handleGeocodeRoute(request, env);
      }

      if (pathname === '/api/reverse' && request.method === 'GET') {
        if (!checkBasicAuth(request, env)) {
          return unauthorizedResponse(correlationId);
        }
        return handleReverseRoute(request, env);
      }

      if (pathname === '/api/normalize-address' && request.method === 'GET') {
        if (!checkBasicAuth(request, env)) {
          return unauthorizedResponse(correlationId);
        }
        return handleNormalizeAddressRoute(request, env);
      }

      // Main lookup endpoint
      if (pathname.startsWith('/api')) {
        const clientId = getClientId(request);
        if (!checkRateLimit(env, clientId)) {
          return rateLimitExceededResponse(correlationId);
        }

        if (!checkBasicAuth(request, env)) {
          return unauthorizedResponse(correlationId);
        }

        return handleLookupRequest(
          request,
          env,
          pathname,
          lookupRiding,
          correlationId,
          startTime,
          getCorsHeaders,
          ctx
        );
      }
      
      return badRequest("Not found", 404, "NOT_FOUND", correlationId)
    } catch (err: unknown) {
      incrementMetric('errorCount');
      recordTiming('totalLookupTime', Date.now() - startTime);
      console.error(`[${correlationId}] Unexpected error:`, err);
      return badRequest(err instanceof Error ? err.message : "Unexpected error", 400, "UNEXPECTED_ERROR", correlationId);
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

