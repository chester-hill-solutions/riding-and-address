import {
  Env,
  BatchLookupRequest,
  BatchLookupResponse,
  BatchJob,
} from './types';
import { parseBatchLookupRequests } from './validation';
import { geocodeBatch } from './geocoding';
import { geocodingExecutor } from './circuit-breaker';
import { incrementMetric, recordTiming } from './metrics';
import {
  performExpandedLookup,
  expandedLookupResponseFields,
  type NormalizedAddressContext,
} from './lookup-expansion';
import { cachedLookupRiding } from './riding-lookup';
import { jsonHeaders, type RouteContext } from './route-context';
import * as queueClient from './queue-client';
import { recordSuccessfulBillable } from './billing';
import { safeParseBatchLookupRequests } from './validation';
import { badRequest, internalErrorResponse } from './utils';

export const BATCH_CONFIG = {
  DEFAULT_BATCH_SIZE: 10,
  MAX_BATCH_SIZE: 100,
  TIMEOUT: 300000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
};

// Maximum batch size limits
export const MAX_BATCH_SIZE = BATCH_CONFIG.MAX_BATCH_SIZE;
export const MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024; // 10MB

// Process batch lookup with batch geocoding (GeoGratis-first). Optional normalization via Google when key configured.
export async function processBatchLookupWithBatchGeocoding(
  ctx: RouteContext,
  requests: BatchLookupRequest[]
): Promise<BatchLookupResponse[]> {
  const { env, request } = ctx;
  const lookupRiding = ctx.deps?.lookup ?? cachedLookupRiding;
  const circuitBreaker = geocodingExecutor();

  if (requests.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE} requests`);
  }

  const results: BatchLookupResponse[] = [];

  incrementMetric('batchRequests');
  const startTime = Date.now();

  try {
    const geocodingNeeded: Array<{ request: BatchLookupRequest; index: number }> = [];
    const coordinatesProvided: Array<{
      request: BatchLookupRequest;
      index: number;
      lon: number;
      lat: number;
    }> = [];

    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      if (req.query.lat !== undefined && req.query.lon !== undefined) {
        coordinatesProvided.push({
          request: req,
          index: i,
          lon: req.query.lon,
          lat: req.query.lat,
        });
      } else {
        geocodingNeeded.push({
          request: req,
          index: i,
        });
      }
    }

    const runExpandedLookup = async (
      batchReq: BatchLookupRequest,
      lon: number,
      lat: number,
      addressContext?: NormalizedAddressContext
    ): Promise<
      Pick<
        BatchLookupResponse,
        | 'point'
        | 'properties'
        | 'riding'
        | 'province_data'
        | 'municipality'
        | 'normalizedAddress'
        | 'addressComponents'
        | 'mailingAddress'
        | 'geocode'
      >
    > => {
      const expanded = await performExpandedLookup(
        env,
        batchReq.pathname,
        { ...batchReq.query, lon, lat },
        lookupRiding,
        {
          lon,
          lat,
          request,
          circuitBreaker,
          addressContext,
        }
      );

      return {
        point: expanded.point,
        ...expandedLookupResponseFields(expanded),
      };
    };

    for (const { request: batchRequest, index, lon, lat } of coordinatesProvided) {
      const itemStart = Date.now();
      try {
        const payload = await runExpandedLookup(batchRequest, lon, lat);
        results[index] = {
          id: batchRequest.id,
          query: batchRequest.query,
          ...payload,
          processingTime: Date.now() - itemStart,
        };
      } catch (error) {
        results[index] = {
          id: batchRequest.id,
          query: batchRequest.query,
          properties: null,
          error: error instanceof Error ? error.message : 'Lookup failed',
          processingTime: Date.now() - itemStart,
        };
      }
    }

    if (geocodingNeeded.length > 0) {
      const queries = geocodingNeeded.map((item) => item.request.query);
      const geocodingResults = await geocodeBatch(env, queries, { request, circuitBreaker });

      for (let i = 0; i < geocodingNeeded.length; i++) {
        const { request: batchRequest, index } = geocodingNeeded[i];
        const geocodingResult = geocodingResults[i];
        const itemStart = Date.now();

        if (geocodingResult.success) {
          try {
            const addressContext: NormalizedAddressContext = {
              normalizedAddress: geocodingResult.normalizedAddress,
              addressComponents: geocodingResult.addressComponents,
              mailingAddress: geocodingResult.mailingAddress,
              geocodeMethod: geocodingResult.geocodeMethod,
              geocodeConfidence: geocodingResult.confidence,
              postalMatch: geocodingResult.postalMatch,
            };
            const payload = await runExpandedLookup(
              batchRequest,
              geocodingResult.lon,
              geocodingResult.lat,
              addressContext
            );
            results[index] = {
              id: batchRequest.id,
              query: batchRequest.query,
              ...payload,
              processingTime: Date.now() - itemStart,
            };
          } catch (error) {
            results[index] = {
              id: batchRequest.id,
              query: batchRequest.query,
              properties: null,
              error: error instanceof Error ? error.message : 'Lookup failed',
              processingTime: Date.now() - itemStart,
            };
          }
        } else {
          results[index] = {
            id: batchRequest.id,
            query: batchRequest.query,
            properties: null,
            error: geocodingResult.error || 'Geocoding failed',
            processingTime: Date.now() - itemStart,
          };
        }
      }
    }

    recordTiming('totalBatchTime', Date.now() - startTime);
    return results;
  } catch (error) {
    incrementMetric('batchErrors');
    recordTiming('totalBatchTime', Date.now() - startTime);
    throw error;
  }
}

/**
 * The one Fuse-denial dialect for a batch item. A batch cannot return the billing shaper's HTTP
 * response per item, so it applies the same wire body (`billableDenialBody`) as the lookup and
 * search routes: redact the payload and carry the shaper's error text.
 */
export function redactFuseDeniedResult(
  item: BatchLookupResponse,
  denialBody: Record<string, unknown>
): void {
  item.properties = null;
  item.riding = undefined;
  item.province_data = undefined;
  item.error =
    typeof denialBody.error === 'string' ? denialBody.error : 'Monthly usage fuse exceeded';
}

// Queue-based batch processing using Durable Objects
export async function submitBatchToQueue(env: Env, requests: unknown): Promise<{ batchId: string; status: string }> {
  const validatedRequests = parseBatchLookupRequests(requests);

  if (validatedRequests.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE} requests`);
  }

  return queueClient.submitBatch(env, validatedRequests);
}

export function getBatchStatus(env: Env, batchId: string): Promise<unknown> {
  return queueClient.getBatchStatus(env, batchId);
}

export function processQueueJobs(env: Env, maxJobs: number = 10): Promise<unknown> {
  return queueClient.processJobs(env, maxJobs);
}

export function createBatchJob(requests: BatchLookupRequest[]): BatchJob {
  return {
    id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    requests,
    status: 'pending',
    createdAt: Date.now(),
    results: [],
    errors: [],
  };
}

export function updateBatchJobStatus(
  job: BatchJob,
  status: BatchJob['status'],
  results?: BatchLookupResponse[],
  errors?: string[]
): BatchJob {
  const updatedJob = { ...job, status };

  if (results) {
    updatedJob.results = results;
  }

  if (errors) {
    updatedJob.errors = errors;
  }

  if (status === 'completed' || status === 'failed') {
    updatedJob.completedAt = Date.now();
  }

  return updatedJob;
}


/**
 * `POST /batch` — the Enterprise batch surface.
 *
 * **Ported out of the Worker's legacy chain.** The behaviour did not change: the same body limit,
 * the same validation, the same Billable-unit accounting, and the same refusal shape.
 *
 * ## The fuse and the batch
 *
 * A batch is a hundred lookups, and the fuse is a Customer's monthly ceiling. So the fuse can be
 * crossed *inside* one request: the first few items are allowed, and then the fuse denies.
 *
 * The denial is applied by **redacting** the item that was refused and every item after it, so
 * the caller never receives work that was not paid for. Returning the results anyway and billing
 * them later would be the alternative, and it is the reason this loop exists.
 *
 * The Customer comes from `ctx.billing`, which the route table's `batch` auth dialect filled. It is
 * null for an operator credential, which is not billed — the operator's own work is not a Billable
 * unit.
 */
export async function handleBatchRoute(ctx: RouteContext): Promise<Response> {
  const { request, env, correlationId } = ctx;

  // Check request body size (limit to 10MB)
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_REQUEST_BODY_SIZE) {
    return badRequest('Request body too large. Maximum size is 10MB', 413);
  }

  let body: { requests?: unknown };
  try {
    body = (await request.json()) as { requests?: unknown };
  } catch (error) {
    return internalErrorResponse(error, 'Batch processing failed', correlationId);
  }
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

  try {
    const results = await processBatchLookupWithBatchGeocoding(ctx, parsedRequests.data);

    // Same Billable unit as realtime: each successful item without error. Once the fuse denies an
    // increment, redact that item and all remaining successes so results are not returned free
    // past the hard fuse. The denial body comes from the one billing shaper, so batch speaks the
    // same dialect.
    const batchBilling = ctx.billing;
    if (batchBilling) {
      let fuseDenial: Record<string, unknown> | null = null;
      for (const item of results) {
        if (item.error) continue;
        if (fuseDenial) {
          redactFuseDeniedResult(item, fuseDenial);
          continue;
        }
        const billed = await recordSuccessfulBillable(env, batchBilling, {
          waitUntil: ctx.deferTask,
        });
        if (!billed.allowed) {
          fuseDenial = ctx.billableDenialBody(billed);
          redactFuseDeniedResult(item, fuseDenial);
        }
      }
    }

    return new Response(JSON.stringify({ results }), { headers: jsonHeaders(ctx) });
  } catch (error) {
    return internalErrorResponse(error, 'Batch processing failed', correlationId);
  }
}

/**
 * `GET /batch/:id` — the status of one batch job.
 *
 * The id is the segment after `/batch/`, which is what the legacy chain read. Reading it the same
 * way keeps the answer the same for every path the old branch answered.
 */
export async function handleBatchStatusRoute(ctx: RouteContext): Promise<Response> {
  const { env, correlationId } = ctx;
  const batchId = ctx.url.pathname.split('/')[2] ?? '';
  try {
    const status = await getBatchStatus(env, batchId);
    return new Response(JSON.stringify(status), { headers: jsonHeaders(ctx) });
  } catch (error) {
    return internalErrorResponse(error, 'Failed to get batch status', correlationId);
  }
}

/**
 * The queue surfaces.
 *
 * **Ported out of the Worker's legacy chain.** The behaviour did not change: the same methods,
 * the same body limit, the same validation, and the same refusal shapes.
 *
 * The queue is the asynchronous half of the Enterprise surface: `/api/queue/submit` takes a batch
 * and hands it to the queue Durable Object, `/api/queue/process` drains jobs, and
 * `/api/queue/status` and `/api/queue/stats` report on it. Every one of them is an operator
 * surface, and the route table declares them so.
 */

/** `POST /api/queue/submit` — hand a batch to the queue. */
export async function handleQueueSubmitRoute(ctx: RouteContext): Promise<Response> {
  const { request, env, correlationId } = ctx;
  if (request.method !== 'POST') {
    return badRequest('Only POST supported for queue submit', 405);
  }

  try {
    // Check request body size (limit to 10MB)
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_REQUEST_BODY_SIZE) {
      return badRequest('Request body too large. Maximum size is 10MB', 413);
    }

    const body = (await request.json()) as { requests?: unknown };
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
    return new Response(JSON.stringify(result), { headers: jsonHeaders(ctx) });
  } catch (error) {
    return internalErrorResponse(error, 'Failed to submit batch to queue', correlationId);
  }
}

/** `GET /api/queue/status` — the state of one queued batch. */
export async function handleQueueStatusRoute(ctx: RouteContext): Promise<Response> {
  const { env, correlationId } = ctx;
  if (ctx.request.method !== 'GET') {
    return badRequest('Only GET supported for status check', 405);
  }

  const batchId = ctx.url.searchParams.get('batchId');
  if (!batchId) {
    return badRequest('Missing required parameter: batchId', 400);
  }

  try {
    const result = await getBatchStatus(env, batchId);
    return new Response(JSON.stringify(result), { headers: jsonHeaders(ctx) });
  } catch (error) {
    return internalErrorResponse(error, 'Failed to get batch status', correlationId);
  }
}

/**
 * `POST /api/queue/process` and `POST /queue/process` — drain jobs from the queue.
 *
 * Two paths, one behaviour: the legacy chain answered both from the same branch, and the second
 * is the older spelling. They are kept apart here only so each entry can declare its own method.
 */
export async function handleQueueProcessRoute(ctx: RouteContext): Promise<Response> {
  const { request, env, correlationId } = ctx;
  try {
    const body = (await request.json()) as { maxJobs?: number };
    const result = await processQueueJobs(env, body.maxJobs || 10);
    return new Response(JSON.stringify(result), { headers: jsonHeaders(ctx) });
  } catch (error) {
    return internalErrorResponse(error, 'Failed to process queue jobs', correlationId);
  }
}

/** `GET /api/queue/stats` — what the queue manager is holding. */
export async function handleQueueStatsRoute(ctx: RouteContext): Promise<Response> {
  const { env, correlationId } = ctx;
  if (ctx.request.method !== 'GET') {
    return badRequest('Only GET supported for queue stats', 405);
  }

  try {
    if (!env.QUEUE_MANAGER) {
      return badRequest('Queue manager not configured', 503);
    }
    const stats = await queueClient.getStats(env);
    return new Response(JSON.stringify(stats), { headers: jsonHeaders(ctx) });
  } catch (error) {
    return internalErrorResponse(error, 'Failed to get queue stats', correlationId);
  }
}
