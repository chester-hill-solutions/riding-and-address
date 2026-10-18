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
import { performCacheWarming } from './cache-warming';
import { geocodingCircuitBreaker, initializeCircuitBreakers, r2CircuitBreaker } from './circuit-breaker';
import { incrementMetric, recordTiming } from './metrics';
import {
  badRequest,
  internalErrorResponse,
  getCorrelationId,
  isLoopbackHost,
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
import { createRouteContext, jsonHeaders, type RouteContext } from './route-context';
import { dispatch } from './routes';
import { handleProjectionRequest } from './projection-handlers';
import { getStats as getQueueStats } from './queue-client';
import { cachedLookupRiding as lookupRiding, loadGeo } from './riding-lookup';
import { r2DatasetSource } from './dataset-source';
import { recordSuccessfulBillable } from './billing';
import {
  authorizeLookupRequest,
  extractBearerToken,
  httpStatusForKeyDenial,
  type KeyAuthResult,
} from './api-keys';
import { rateLimitExceededResponse, DEFAULT_RATE_LIMIT, DEFAULT_DEMO_RATE_LIMIT } from './utils';
import { consumeRateWindow, rateLimitIdentity, rateLimitKey } from './rate-limit';
import { getAgentQuickstart, createCanCoderMcpHandler } from './mcp';
import { createUcpProfile } from './ucp-profile';
import { createServiceTerms } from './service-terms';
import { EvmRpcChainClient, reconcileReceipts } from './x402-reconcile';
import { X402_VERSION, x402ConfigFromEnv } from './x402';
import { payerDailyCapUsd } from './x402-spend';
import { createLlmsTxt, createLlmsFullTxt } from './llms-txt';
import {
  createAgentSkillsIndex,
  createAiCatalog,
  createAuthMd,
  createMcpServerCard,
  createRidingLookupSkill,
  ridingLookupSkillPath,
} from './agent-discovery';

// Global state

/**
 * Handle scheduled events (Cron Triggers) for cache warming.
 */
async function handleScheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
  console.log(`[Cron] Scheduled event triggered: ${event.cron}`);
  
  // Perform cache warming
  try {
    await performCacheWarming(env);
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

  // Confirm stored x402 settlements against the chain. Only runs when the rail is configured, so it
  // is a no-op until someone enables payments.
  if (env.X402_RPC_URL && env.X402_RECEIPTS) {
    try {
      const report = await reconcileReceipts(env, new EvmRpcChainClient(env.X402_RPC_URL));
      console.log(
        `[Cron] x402 reconciliation: checked ${report.checked}, confirmed ${report.confirmed}, ` +
          `failed ${report.failed}, unknown ${report.unknown}, undelivered ${report.deliveryFailed}`
      );
    } catch (error) {
      console.error('[Cron] x402 reconciliation failed:', error);
    }
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
 * `handler: legacy`. Auth and rate limiting are declared on the table and enforced once by
 * `runPrelude`; what remains here is body parsing and the store/lookup call for each unported
 * surface. Ported surfaces no longer have a branch.
 */
async function legacyFetch(routeCtx: RouteContext): Promise<Response> {
  const { request, env, url } = routeCtx;
  const pathname = url.pathname;
  const correlationId = routeCtx.correlationId;

  // Spatial database endpoints. The admin gate on init/sync/stats is declared on the table and run
  // by the prelude; `/api/database/query` is public and unknown sub-paths are a bare 404.
  if (pathname.startsWith('/api/database')) {
    if (pathname === '/api/database/init' && request.method === 'POST') {
      try {
        const success = await initializeSpatialDatabase(env);
        return new Response(JSON.stringify({
          success,
          message: success ? "Database initialized successfully" : "Database initialization failed"
        }), { headers: jsonHeaders(routeCtx) });
      } catch (error) {
        return internalErrorResponse(error, 'Database initialization failed', correlationId);
      }
    }

    if (pathname === '/api/database/sync' && request.method === 'POST') {
      try {
        const body = await request.json() as { dataset?: string };
        const dataset = body.dataset || 'federalridings-2024.geojson';

        const result = await syncGeoJSONToDatabase(env, dataset, r2DatasetSource(env));
        return new Response(JSON.stringify({
          success: result.success,
          inserted: result.inserted,
          failed: result.failed,
          message: result.success
            ? `Database synced for ${dataset}`
            : `Database sync incomplete for ${dataset}`,
          dataset
        }), { headers: jsonHeaders(routeCtx) });
      } catch (error) {
        return internalErrorResponse(error, 'Database sync failed', correlationId);
      }
    }

    if (pathname === '/api/database/stats' && request.method === 'GET') {
      try {
        const stats = await getSpatialDatabaseStats(env);
        return new Response(JSON.stringify({
          enabled: stats !== null,
          status: stats !== null ? "active" : "disabled",
          // Real D1 counts only — no placeholder fields when the database is disabled.
          ...(stats !== null ? { features: stats.features, lastSync: stats.lastSync } : {})
        }), { headers: jsonHeaders(routeCtx) });
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
        return new Response(JSON.stringify(result), { headers: jsonHeaders(routeCtx) });
      } catch (error) {
        return internalErrorResponse(error, 'Database query failed', correlationId);
      }
    }

    return badRequest("Database endpoint not found", 404);
  }

  // Boundary read endpoints (public).
  if (pathname.startsWith('/api/boundaries')) {
    if (pathname === '/api/boundaries/lookup' && request.method === 'GET') {
      const lat = parseFloat(url.searchParams.get('lat') || '');
      const lon = parseFloat(url.searchParams.get('lon') || '');

      if (isNaN(lat) || isNaN(lon)) {
        return badRequest('Invalid lat/lon parameters', 400);
      }

      try {
        const result = await lookupRiding(env, resolveLookupPath('/api').datasetPath, lon, lat);
        return new Response(JSON.stringify(result), { headers: jsonHeaders(routeCtx) });
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
          return new Response(JSON.stringify(result), { headers: jsonHeaders(routeCtx) });
        }
        return badRequest('Spatial database not enabled', 503);
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
      }), { headers: jsonHeaders(routeCtx) });
    }

    return badRequest("Boundaries endpoint not found", 404);
  }

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
      }), { headers: jsonHeaders(routeCtx) });
    }
    return badRequest("Method not allowed", 405);
  }

  if (pathname === "/api/cache/warm") {
    if (request.method === "POST") {
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
        }), { headers: jsonHeaders(routeCtx) });
      } catch (error) {
        return internalErrorResponse(error, 'Cache warming failed', correlationId);
      }
    }
    return badRequest("Method not allowed", 405);
  }

  // Batch processing. The Enterprise gate is declared on the table (auth: 'batch') and run by the
  // prelude, which also resolves the Billable Customer onto `ctx.billing`; this branch only reads
  // and processes the request.
  if (pathname.startsWith('/batch')) {
    const batchBilling = routeCtx.billing;

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

        // Same Billable unit as realtime: each successful item without error. Once the fuse
        // denies an increment, redact that item and all remaining successes so results are not
        // returned free past the hard fuse. The denial body comes from the one billing shaper, so
        // batch speaks the same dialect.
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

        return new Response(JSON.stringify({ results }), { headers: jsonHeaders(routeCtx) });
      } catch (error) {
        return internalErrorResponse(error, 'Batch processing failed', correlationId);
      }
    }

    if (pathname.startsWith('/batch/') && request.method === 'GET') {
      const batchId = pathname.split('/')[2];
      try {
        const status = await getBatchStatus(env, batchId);
        return new Response(JSON.stringify(status), { headers: jsonHeaders(routeCtx) });
      } catch (error) {
        return internalErrorResponse(error, 'Failed to get batch status', correlationId);
      }
    }
  }

  // Queue surfaces. Auth is declared per entry and run by the prelude.
  if (pathname === "/api/queue/submit") {
    if (request.method !== "POST") {
      return badRequest("Only POST supported for queue submit", 405);
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
      return new Response(JSON.stringify(result), { headers: jsonHeaders(routeCtx) });
    } catch (error) {
      return internalErrorResponse(error, 'Failed to submit batch to queue', correlationId);
    }
  }

  if (pathname === "/api/queue/status") {
    if (request.method !== "GET") {
      return badRequest("Only GET supported for status check", 405);
    }

    const batchId = url.searchParams.get('batchId');
    if (!batchId) {
      return badRequest("Missing required parameter: batchId", 400);
    }

    try {
      const result = await getBatchStatus(env, batchId);
      return new Response(JSON.stringify(result), { headers: jsonHeaders(routeCtx) });
    } catch (error) {
      return internalErrorResponse(error, 'Failed to get batch status', correlationId);
    }
  }

  if (pathname === "/api/queue/process") {
    if (request.method !== "POST") {
      return badRequest("Only POST supported for queue processing", 405);
    }

    try {
      const body = await request.json() as { maxJobs?: number };
      const result = await processQueueJobs(env, body.maxJobs || 10);
      return new Response(JSON.stringify(result), { headers: jsonHeaders(routeCtx) });
    } catch (error) {
      return internalErrorResponse(error, 'Failed to process queue jobs', correlationId);
    }
  }

  if (pathname === "/api/queue/stats") {
    if (request.method !== "GET") {
      return badRequest("Only GET supported for queue stats", 405);
    }

    try {
      // Get queue stats from the queue manager
      if (!env.QUEUE_MANAGER) {
        return badRequest("Queue manager not configured", 503);
      }

      const stats = await getQueueStats(env);
      return new Response(JSON.stringify(stats), { headers: jsonHeaders(routeCtx) });
    } catch (error) {
      return internalErrorResponse(error, 'Failed to get queue stats', correlationId);
    }
  }

  if (pathname === '/queue/process' && request.method === 'POST') {
    try {
      const body = await request.json() as { maxJobs?: number };
      const result = await processQueueJobs(env, body.maxJobs || 10);
      return new Response(JSON.stringify(result), { headers: jsonHeaders(routeCtx) });
    } catch (error) {
      return internalErrorResponse(error, 'Queue processing failed', correlationId);
    }
  }

  // Portal → Worker KV projection. The Bearer gate (auth: 'projection') runs in the prelude.
  if (pathname.startsWith('/admin/projection/')) {
    return handleProjectionRequest(routeCtx);
  }

  // ODA geolocation endpoints. Rate-limited and key-authed like the /api catch-all below, but
  // intentionally NOT billed: only 200 lookup/search responses are Billable units today.
  if (pathname === '/api/geocode' && request.method === 'GET') {
    return handleGeocodeRoute(routeCtx);
  }

  if (pathname === '/api/reverse' && request.method === 'GET') {
    return handleReverseRoute(routeCtx);
  }

  if (pathname === '/api/normalize-address' && request.method === 'GET') {
    return handleNormalizeAddressRoute(routeCtx);
  }

  // Address autocomplete. Must stay above the /api catch-all below, which rejects
  // unregistered lookup paths. Disabled autocomplete therefore returns 404.
  if (
    pathname === '/api/search' &&
    request.method === 'GET' &&
    isOdaSuggestEnabled(env)
  ) {
    return handleSearchRoute(routeCtx);
  }

  // Main lookup endpoint. The key gate (auth: 'key') ran in the prelude, which filled `billing`.
  if (pathname.startsWith('/api')) {
    return handleLookupRequest(routeCtx);
  }

  return badRequest("Not found", 404, "NOT_FOUND", correlationId)
}

function configuredPublicOrigins(env: Env): string[] {
  const values = [
    ...(env.PUBLIC_API_HOSTS || '').split(',').map((value) => value.trim()).filter(Boolean),
    env.PUBLIC_API_BASE_URL,
    env.BASE_URL,
    'https://riding-lookup.chester-hill-solutions.workers.dev',
  ];
  return values.flatMap((value) => {
    if (!value) return [];
    try {
      const url = new URL(value.includes('://') ? value : `https://${value}`);
      return url.protocol === 'https:' || url.hostname === 'localhost' ? [url.origin.toLowerCase()] : [];
    } catch {
      return [];
    }
  });
}

function discoveryOrigin(request: Request, env: Env): string {
  const url = new URL(request.url);
  const origin = url.origin.toLowerCase();
  const local = isLoopbackHost(url.hostname);
  return local || configuredPublicOrigins(env).includes(origin)
    ? url.origin
    : configuredPublicOrigins(env)[0] || 'https://riding-lookup.chester-hill-solutions.workers.dev';
}

async function discoveryResponse(routeCtx: RouteContext): Promise<Response | null> {
  const { request, env, url } = routeCtx;
  const origin = discoveryOrigin(request, env);
  const pathname = url.pathname;
  if (pathname === '/docs/agents.md' && request.method === 'GET') {
    return new Response(getAgentQuickstart(origin), { headers: { ...routeCtx.corsHeaders(request.headers.get('Origin')), 'content-type': 'text/markdown; charset=utf-8' } });
  }
  if (pathname === '/robots.txt' && request.method === 'GET') {
    const disallow = ['Disallow: /app/', 'Disallow: /api/auth/', 'Disallow: /api/stripe/', 'Disallow: /api/database/', 'Disallow: /api/cache/', 'Disallow: /admin/', 'Disallow: /metrics', 'Disallow: /webhooks', 'Disallow: /queue/', 'Disallow: /batch'];
    const body = [
      'User-agent: *', 'Allow: /', ...disallow, '',
      'User-agent: OAI-SearchBot', 'Allow: /', ...disallow, '',
      'User-agent: Claude-SearchBot', 'Allow: /', ...disallow, '',
      'User-agent: PerplexityBot', 'Allow: /', ...disallow, '',
      'User-agent: GPTBot', 'Disallow: /', '',
      'User-agent: ClaudeBot', 'Disallow: /', '',
      'User-agent: Google-Extended', 'Disallow: /', '',
      'Content-Signal: ai-train=no, search=yes, ai-input=yes',
      `Agentmap: ${origin}/.well-known/ai-catalog.json`,
      `Sitemap: ${origin}/sitemap.xml`, '',
    ].join('\n');
    return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  if (pathname === '/sitemap.xml' && request.method === 'GET') {
    const paths = ['/', '/docs', '/docs/embed', '/docs/agents.md', '/api/docs'];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${origin}${path}</loc></url>`).join('')}</urlset>`;
    return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
  }
  if (pathname === '/llms.txt' && request.method === 'GET') {
    return new Response(createLlmsTxt(origin), { headers: { 'content-type': 'text/plain; charset=utf-8', ...routeCtx.corsHeaders(request.headers.get('Origin')) } });
  }
  if (pathname === '/llms-full.txt' && request.method === 'GET') {
    return new Response(createLlmsFullTxt(origin), { headers: { 'content-type': 'text/plain; charset=utf-8', ...routeCtx.corsHeaders(request.headers.get('Origin')) } });
  }
  if (pathname === '/.well-known/cancoder.json' && request.method === 'GET') {
    // Publish payment only if this deployment can actually take it: the block is built from the same
    // environment the accept path settles with, so the document cannot claim a capability the Worker
    // does not have — nor stay silent about one it does.
    const rail = x402ConfigFromEnv(env);
    const payment = rail
      ? {
          protocol: 'x402',
          version: X402_VERSION,
          scheme: 'exact',
          network: rail.network,
          asset: rail.asset,
          perPayerDailyCapUsd: payerDailyCapUsd(env),
        }
      : null;
    return Response.json(createServiceTerms(origin, payment), { headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' } });
  }
  if (pathname === '/.well-known/ucp' && request.method === 'GET') {
    return Response.json(createUcpProfile(origin), { headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' } });
  }
  if (pathname === '/.well-known/api-catalog' && request.method === 'GET') {
    return Response.json({ linkset: [
      { anchor: `${origin}/api`, 'service-desc': [`${origin}/api/docs`, `${origin}/.well-known/cancoder.json`], 'service-doc': [`${origin}/docs`], status: [`${origin}/health`] },
      { anchor: `${origin}/mcp`, 'service-doc': [`${origin}/docs/agents.md`], status: [`${origin}/health`] },
    ] }, { headers: { 'content-type': 'application/linkset+json; charset=utf-8', 'access-control-allow-origin': '*' } });
  }
  if (pathname === '/auth.md' && request.method === 'GET') {
    return new Response(createAuthMd(origin), { headers: { 'content-type': 'text/markdown; charset=utf-8', ...routeCtx.corsHeaders(request.headers.get('Origin')) } });
  }
  if (pathname === '/.well-known/mcp/server-card.json' && request.method === 'GET') {
    return Response.json(createMcpServerCard(origin), { headers: { 'access-control-allow-origin': '*' } });
  }
  if (pathname === '/.well-known/agent-skills/index.json' && request.method === 'GET') {
    return Response.json(await createAgentSkillsIndex(origin), { headers: { 'access-control-allow-origin': '*' } });
  }
  if (pathname === ridingLookupSkillPath() && request.method === 'GET') {
    return new Response(createRidingLookupSkill(origin), { headers: { 'content-type': 'text/markdown; charset=utf-8', ...routeCtx.corsHeaders(request.headers.get('Origin')) } });
  }
  if (pathname === '/.well-known/ai-catalog.json' && request.method === 'GET') {
    return Response.json(createAiCatalog(origin), { headers: { 'access-control-allow-origin': '*' } });
  }
  return null;
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

      const discovery = await discoveryResponse(routeCtx);
      if (discovery) return discovery;

      if (routeCtx.url.pathname === '/mcp') {
        const requestHost = request.headers.get('Host')?.toLowerCase();
        const localHost = !!requestHost && (
          requestHost === 'localhost' || requestHost.startsWith('localhost:') ||
          requestHost.startsWith('127.0.0.1:') || requestHost.endsWith('.localhost')
        );
        const requestOrigin = routeCtx.url.origin.toLowerCase();
        if (!requestHost || requestHost !== routeCtx.url.host.toLowerCase() ||
            (!localHost && !configuredPublicOrigins(env).includes(requestOrigin))) {
          return badRequest('Unrecognized host', 421, 'MISDIRECTED_REQUEST', correlationId);
        }
        const origin = request.headers.get('Origin');
        if (origin && !localHost && origin.toLowerCase() !== requestOrigin) {
          return badRequest('Origin not allowed', 403, 'ORIGIN_NOT_ALLOWED', correlationId);
        }

        const bearerToken = extractBearerToken(request);
        if (!bearerToken && (request.headers.has('Authorization') || request.headers.has('X-Api-Key'))) {
          return badRequest('Use Authorization: Bearer <Server API key> for authenticated MCP calls.', 401, 'KEY_REQUIRED', correlationId);
        }
        let auth: KeyAuthResult | null = null;
        if (bearerToken) {
          auth = await authorizeLookupRequest(env, request, false);
          if (!auth.ok) {
            const status = auth.reason ? httpStatusForKeyDenial(auth.reason) : 401;
            return badRequest(auth.message || 'Unauthorized', status, auth.reason || 'UNAUTHORIZED', correlationId);
          }
        }
        // Keyed on the authenticated key when there is one, and on the address only for the keyless
        // demo tier. An authenticated call used to be bucketed by IP like everything else, so an
        // agent on a shared cloud egress was throttled by its neighbours' traffic — and an agent
        // rotating addresses was not throttled at all.
        const limit = parseInt(
          bearerToken
            ? String(env.RATE_LIMIT || DEFAULT_RATE_LIMIT)
            : String(env.DEMO_RATE_LIMIT || DEFAULT_DEMO_RATE_LIMIT),
          10
        );
        const allowed = (
          await consumeRateWindow(env, 'mcp', rateLimitKey('mcp', request, rateLimitIdentity(auth)), limit)
        ).allowed;
        if (!allowed) {
          return rateLimitExceededResponse(correlationId);
        }

        const response = await createCanCoderMcpHandler({ request, routeContext: routeCtx, lookupRiding, auth }).fetch(request);
        if (origin && (origin.toLowerCase() === requestOrigin || localHost)) {
          const headers = new Headers(response.headers);
          for (const [name, value] of Object.entries(routeCtx.corsHeaders(origin))) headers.set(name, value);
          return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
        }
        return response;
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

