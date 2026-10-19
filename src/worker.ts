/// <reference types="@cloudflare/workers-types" />

import {
  Env
} from './types';
import { performCacheWarming } from './cache-warming';
import { geocodingCircuitBreaker, initializeCircuitBreakers, r2CircuitBreaker } from './circuit-breaker';
import { incrementMetric, recordTiming } from './metrics';
import { 
  processWebhookEvents,
  cleanupWebhookData
} from './webhooks';
import { QueueManagerDO } from './queue-manager';
import { ApiKeyUsageDO } from './api-key-usage-do';
import { CircuitBreakerDO } from './circuit-breaker-do';
import { dispatch } from './routes';
import { createRouteContext } from './route-context';
import { getCorrelationId, internalErrorResponse } from './utils';
import { corsHeaders, NO_CORS_MARKER, withVaryOrigin } from './http-headers';
import { EvmRpcChainClient, reconcileReceipts } from './x402-reconcile';

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
 * Apply the CORS policy to a response, at the one boundary every response passes through.
 *
 * **Why this is at the boundary and not in each error helper.** The success path had CORS
 * headers and the error paths had none, so a browser caller could read a successful lookup and
 * could not read the error that told it what had gone wrong. That is a per-call-site omission
 * waiting to happen again, and there are dozens of call sites. One boundary is the only place
 * the answer cannot drift.
 *
 * A response that already carries an `Access-Control-Allow-Origin` keeps it: the public
 * discovery documents and the MCP surface have their own, stricter policies, and clobbering
 * them with the general one would loosen them.
 */
function applyCorsPolicy(response: Response, env: Env, request: Request): Response {
  const headers = new Headers(response.headers);
  // A refusal on origin grounds opts out: echoing the rejected origin back would let the
  // offending page read the response and would undercut the check that just failed.
  const optedOut = headers.get(NO_CORS_MARKER) !== null;
  headers.delete(NO_CORS_MARKER);
  withVaryOrigin(headers);
  if (!optedOut && !headers.has('access-control-allow-origin')) {
    for (const [name, value] of Object.entries(corsHeaders(env, request.headers.get('Origin')))) {
      headers.set(name, value);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const response = await handleRequest(request, env, ctx);
    return applyCorsPolicy(response, env, request);
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

/**
 * The request, answered.
 *
 * A separate function from `fetch` so that `fetch` can be the one place the response's headers
 * are decided. Everything below returns a response; `fetch` gives all of them the same CORS
 * policy.
 */
async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now();
    const correlationId = getCorrelationId(request);
    incrementMetric('requestCount');

    // Initialize circuit breakers with environment (for Durable Object support)
    if (!geocodingCircuitBreaker || !r2CircuitBreaker) {
      initializeCircuitBreakers(env);
    }

    try {
      // Build the one request context up front; the prelude fills auth, rate-limit and headers
      // for every entry, and the dispatcher adds the path parameters it matched.
      const routeCtx = createRouteContext({ request, env, ctx, correlationId, startTime });

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        const origin = request.headers.get('Origin');
        return new Response(null, {
          status: 200,
          headers: routeCtx.corsHeaders(origin)
        });
      }



      return await dispatch(routeCtx);
    } catch (err: unknown) {
      incrementMetric('errorCount');
      recordTiming('totalLookupTime', Date.now() - startTime);
      // Generic body: internal error messages (stack context, binding names, R2 keys) must not
      // reach clients. The real error is logged with the correlation ID for tracing.
      return internalErrorResponse(err, 'Unexpected error', correlationId, 'UNEXPECTED_ERROR');
    }
}

// Export Durable Objects
export { QueueManagerDO };
export { CircuitBreakerDO };
export { ApiKeyUsageDO };

