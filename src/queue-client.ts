import { Env } from './types';

/**
 * Typed client for the QueueManager Durable Object (`main-queue`).
 * The only place that knows the DO's URI space and error envelope.
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
  requests: unknown
): Promise<{ batchId: string; status: string }> {
  return call(env, '/queue/submit', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ requests })
  });
}

export function getBatchStatus<T = unknown>(env: Env, batchId: string): Promise<T> {
  return call(env, `/queue/status?batchId=${encodeURIComponent(batchId)}`);
}

export function getJob<T = unknown>(env: Env, jobId: string): Promise<T> {
  return call(env, `/queue/job?id=${encodeURIComponent(jobId)}`);
}

export function getBatchResult<T = unknown>(env: Env, id: string): Promise<T> {
  return call(env, `/queue/batch?id=${encodeURIComponent(id)}`);
}

export function getStats<T = unknown>(env: Env): Promise<T> {
  return call(env, '/queue/stats');
}

export function retryFailed(env: Env, jobIds: string[]): Promise<unknown> {
  return call(env, '/queue/retry', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ jobIds })
  });
}

export function processJobs(env: Env, maxJobs: number = 10): Promise<unknown> {
  return call(env, '/queue/process', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ maxJobs })
  });
}

export function health<T = unknown>(env: Env): Promise<T> {
  return call(env, '/queue/health');
}

export function listDeadLetter<T = unknown>(
  env: Env,
  limit: number = 50,
  offset: number = 0
): Promise<T> {
  return call(env, `/queue/dead-letter?limit=${limit}&offset=${offset}`);
}

export function retryDeadLetter(
  env: Env,
  jobIds: string[],
  options?: { resetAttempts?: boolean; newPriority?: number | null }
): Promise<unknown> {
  return call(env, '/queue/retry-dead-letter', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ jobIds, resetAttempts: true, newPriority: null, ...options })
  });
}
