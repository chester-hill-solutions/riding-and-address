import type { BatchLookupRequest, Env } from './types';
import type {
  BatchJob,
  DeadLetterResult,
  ProcessJobsResult,
  QueueJob,
  QueueStats,
  RetryDeadLetterResult,
  RetryFailedResult,
  SubmitBatchResult
} from './queue-types';

/**
 * Typed client for the QueueManager Durable Object (`main-queue`).
 * The only place that knows the DO's URI space and error envelope.
 * Return types are the DO's wire envelopes, shared via `queue-types.ts`.
 */

function stub(env: Env) {
  if (!env.QUEUE_MANAGER) {
    throw new Error('Queue manager not configured');
  }
  return env.QUEUE_MANAGER.get(env.QUEUE_MANAGER.idFromName('main-queue'));
}

async function call<T>(env: Env, path: string, init?: RequestInit): Promise<T> {
  const response = await stub(env).fetch(new Request(`https://queue.local${path}`, init));
  if (!response.ok) {
    let message = `Queue request failed: ${path}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body — keep generic message
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function submitBatch(
  env: Env,
  requests: BatchLookupRequest[]
): Promise<SubmitBatchResult> {
  return call(env, '/queue/submit', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ requests })
  });
}

export function getBatchStatus(env: Env, batchId: string): Promise<BatchJob> {
  return call(env, `/queue/status?batchId=${encodeURIComponent(batchId)}`);
}

export function getJob(env: Env, jobId: string): Promise<QueueJob> {
  return call(env, `/queue/job?id=${encodeURIComponent(jobId)}`);
}

export function getStats(env: Env): Promise<QueueStats> {
  return call(env, '/queue/stats');
}

export function retryFailed(env: Env, jobIds: string[]): Promise<RetryFailedResult> {
  return call(env, '/queue/retry', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ jobIds })
  });
}

export function processJobs(env: Env, maxJobs: number = 10): Promise<ProcessJobsResult> {
  return call(env, '/queue/process', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ maxJobs })
  });
}

export function listDeadLetter(
  env: Env,
  limit: number = 50,
  offset: number = 0
): Promise<DeadLetterResult> {
  return call(env, `/queue/dead-letter?limit=${limit}&offset=${offset}`);
}

export function retryDeadLetter(
  env: Env,
  jobIds: string[],
  options?: { resetAttempts?: boolean; newPriority?: number | null }
): Promise<RetryDeadLetterResult> {
  return call(env, '/queue/retry-dead-letter', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ jobIds, resetAttempts: true, newPriority: null, ...options })
  });
}
