/// <reference types="@cloudflare/workers-types" />

import { BatchLookupRequest, BatchLookupResponse, Env } from './types';
import { parseBatchLookupRequests } from './validation';
import { performExpandedLookup, expandedLookupResponseFields, type LookupRidingFn } from './lookup-expansion';
import { createLookupRiding } from './riding-lookup';
import { r2DatasetSource, createDatasetCaches, type DatasetSource } from './dataset-source';
import { geocodeIfNeeded } from './geocoding';
import { QueuePolicy, type QueueStateSnapshot } from './queue-policy';
import type { QueueJob } from './queue-types';

// The DO's wire types live in `queue-types.ts`; re-exported here so this
// module's public surface is unchanged.
export type { BatchJob, QueueJob, QueueStats } from './queue-types';

const QUEUE_STATE_KEY = 'queueState';

/**
 * `QueueManager` Durable Object — now a thin adapter.
 *
 * It owns exactly two things:
 * - the HTTP `fetch` contract (`/queue/*` routes and their response envelopes),
 * - `state.storage` persistence, exposed to the policy as a `QueuePersistence`.
 *
 * All queue policy (priority, retry/backoff, dead-letter, aggregation, stats)
 * lives in `queue-policy.ts`. The job runner — `cachedLookupRiding` +
 * `geocodeIfNeeded` driven by `this.env` — is injected into the policy rather
 * than imported by it.
 */
export class QueueManager {
  private state: DurableObjectState;
  private env: Env;
  private policy: QueuePolicy;
  /**
   * The DO's own dataset source and LRUs, built once per isolate. The Worker's module-global LRUs
   * are a different copy, so the queue's spatial cache is explicitly isolated rather than an
   * implicit share of whatever the Worker happened to warm.
   */
  private datasetSource: DatasetSource;
  private lookupRiding: LookupRidingFn;
  private stateLoadPromise: Promise<void> | null = null;
  private stateLoaded: boolean = false;
  private stateLoadError: Error | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.datasetSource = r2DatasetSource(env, createDatasetCaches());
    this.lookupRiding = createLookupRiding(this.datasetSource);
    this.policy = new QueuePolicy({
      persistence: {
        load: () => this.state.storage.get<QueueStateSnapshot>(QUEUE_STATE_KEY),
        save: (snapshot) => this.state.storage.put(QUEUE_STATE_KEY, snapshot),
      },
      runJob: (job) => this.runJob(job),
    });
    // Load persisted state on initialization and store the promise
    this.stateLoadPromise = this.loadStateWithRetry();
  }

  // Load state from Durable Object storage with retry logic
  private async loadStateWithRetry(maxRetries: number = 3): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.policy.load();
        this.stateLoaded = true;
        this.stateLoadError = null;
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Failed to load queue manager state (attempt ${attempt}/${maxRetries}):`, lastError);

        if (attempt < maxRetries) {
          // Exponential backoff: wait 100ms, 200ms, 400ms
          const delay = 100 * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    this.stateLoadError = lastError;
    console.error('Failed to load queue manager state after all retries. Operating with empty state.', lastError);
    // Don't throw - allow the queue manager to operate with empty state rather than failing completely
  }

  async fetch(request: Request): Promise<Response> {
    // Ensure state is loaded before processing any requests
    if (this.stateLoadPromise) {
      try {
        await this.stateLoadPromise;
      } catch (error) {
        // Error already logged in loadStateWithRetry, but log here too for visibility
        console.error('State load failed in fetch handler:', error);
      } finally {
        this.stateLoadPromise = null; // Clear promise after first load attempt
      }
    }

    // If state failed to load, log a warning but continue processing
    if (this.stateLoadError && !this.stateLoaded) {
      console.warn('Queue manager operating with empty state due to load failure. Previous jobs/batches may not be visible.');
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case '/queue/submit':
          return await this.handleSubmitBatch(request);
        case '/queue/status':
          return await this.handleGetStatus(request);
        case '/queue/job':
          return await this.handleGetJob(request);
        case '/queue/batch':
          return await this.handleGetBatch(request);
        case '/queue/stats':
          return await this.handleGetStats();
        case '/queue/retry':
          return await this.handleRetryFailed(request);
        case '/queue/process':
          return await this.handleProcessJobs(request);
        case '/queue/health':
          return await this.handleHealthCheck();
        case '/queue/dead-letter':
          return await this.handleDeadLetterQueue(request);
        case '/queue/retry-dead-letter':
          return await this.handleRetryDeadLetterJobs(request);
        default:
          return new Response('Not found', { status: 404 });
      }
    } catch (error) {
        console.error('Queue manager error:', error);
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleSubmitBatch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Check request body size (limit to 10MB)
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'Request body too large. Maximum size is 10MB' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json() as { requests: unknown; priority?: number; tags?: string[] };
    let requests: BatchLookupRequest[];
    try {
      requests = parseBatchLookupRequests(body.requests);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid requests array';
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const { priority = 1, tags = [] } = body;

    if (!Array.isArray(requests) || requests.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid requests array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate batch size (maximum 100 requests)
    const MAX_BATCH_SIZE = 100;
    if (requests.length > MAX_BATCH_SIZE) {
      return new Response(JSON.stringify({ error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} requests` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await this.policy.submitBatch({ requests, priority, tags });

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleGetStatus(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const batchId = url.searchParams.get('batchId');
    const jobId = url.searchParams.get('jobId');

    if (batchId) {
      const batch = this.policy.getBatch(batchId);
      if (!batch) {
        return new Response(JSON.stringify({ error: 'Batch not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(batch), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (jobId) {
      const job = this.policy.getJob(jobId);
      if (!job) {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(job), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Missing batchId or jobId parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleGetJob(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const jobId = url.searchParams.get('id');

    if (!jobId) {
      return new Response(JSON.stringify({ error: 'Missing job id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const job = this.policy.getJob(jobId);
    if (!job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(job), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleGetBatch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const batchId = url.searchParams.get('id');

    if (!batchId) {
      return new Response(JSON.stringify({ error: 'Missing batch id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const batch = this.policy.getBatch(batchId);
    if (!batch) {
      return new Response(JSON.stringify({ error: 'Batch not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(batch), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleGetStats(): Promise<Response> {
    return new Response(JSON.stringify(this.policy.getStats()), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleRetryFailed(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const body = await request.json() as { jobIds: string[] };
    const { jobIds } = body;

    if (!Array.isArray(jobIds)) {
      return new Response(JSON.stringify({ error: 'Invalid jobIds array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await this.policy.retryFailed(jobIds);

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleProcessJobs(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const body = await request.json() as { maxJobs?: number; priority?: number | null };
    // Validate and clamp maxJobs (1-100)
    const rawMaxJobs = body.maxJobs ?? 10;
    const maxJobs = Math.max(1, Math.min(Math.floor(rawMaxJobs), 100));
    const priority = body.priority ?? null;

    const result = await this.policy.processJobs({ maxJobs, priority });

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleHealthCheck(): Promise<Response> {
    return new Response(JSON.stringify(this.policy.getHealth()), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleDeadLetterQueue(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    return new Response(JSON.stringify(this.policy.listDeadLetter({ limit, offset })), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleRetryDeadLetterJobs(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const body = await request.json() as { jobIds: string[]; resetAttempts?: boolean; newPriority?: number | null };
    const { jobIds, resetAttempts = true, newPriority = null } = body;

    if (!Array.isArray(jobIds)) {
      return new Response(JSON.stringify({ error: 'Invalid jobIds array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await this.policy.retryDeadLetter({ jobIds, resetAttempts, newPriority });

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * The injected job runner. Binds the concrete lookup/geocode functions and
   * `this.env` here — the policy never imports them.
   *
   * A genuine lookup failure rejects this promise; only a resolved
   * `BatchLookupResponse` is a completed job. `performExpandedLookup` throws on
   * failure (missing coordinates, lookup timeout, R2/geocoder errors) and
   * resolves `properties: null` for a legitimate "no riding found", so letting
   * the throw propagate is exactly the policy's failure signal: it records
   * `error.message` as `lastError`, retries with backoff, and dead-letters on
   * exhaustion. Swallowing the throw here would record a failed lookup as
   * `completed` and make that engine unreachable in production.
   */
  private async runJob(job: QueueJob): Promise<BatchLookupResponse> {
    const started = job.startedAt ?? Date.now();

    const expanded = await performExpandedLookup(
      this.env,
      job.request.pathname,
      job.request.query,
      this.lookupRiding,
      {
        geocodeIfNeeded: geocodeIfNeeded,
      }
    );
    return {
      id: job.request.id,
      query: job.request.query,
      point: expanded.point,
      ...expandedLookupResponseFields(expanded),
      processingTime: Date.now() - started,
    };
  }
}

export { QueueManager as QueueManagerDO };
