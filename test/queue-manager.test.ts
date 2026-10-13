import { describe, it, expect } from 'vitest';
import {
  QueuePolicy,
  calculateRetryDelay,
  type QueuePersistence,
  type QueueJobRunner,
  type QueueStateSnapshot,
} from '../src/queue-policy';
import { QueueManagerDO } from '../src/queue-manager';
import type { BatchLookupRequest, Env } from '../src/types';
import type { DeadLetterResult, ProcessJobsResult, QueueJob } from '../src/queue-types';

/**
 * First tests for the Enterprise queue core.
 *
 * The policy is driven in-process with a fake storage adapter and a fake job
 * runner — no Durable Object, no `Env`, no network. A couple of thin assertions
 * then cover the DO adapter's route/envelope contract.
 */

function postalRequest(id: string, postal = 'M5V 2T6'): BatchLookupRequest {
  return { id, query: { postal }, pathname: '/api/federal' };
}

const successRunner: QueueJobRunner = async (job) => ({
  id: job.request.id,
  query: job.request.query,
  properties: {},
  processingTime: 0,
});

const failingRunner: QueueJobRunner = async () => {
  throw new Error('boom');
};

function createClock(start = 1_000_000_000) {
  let value = start;
  return {
    now: () => value,
    advance: (ms: number) => {
      value += ms;
    },
  };
}

function createPersistence(initial?: QueueStateSnapshot) {
  let stored = initial;
  const saves: QueueStateSnapshot[] = [];
  const persistence: QueuePersistence = {
    load: async () => stored,
    save: async (snapshot) => {
      stored = snapshot;
      saves.push(snapshot);
    },
  };
  return { persistence, saves };
}

function createPolicy(runJob: QueueJobRunner = successRunner) {
  const clock = createClock();
  const { persistence, saves } = createPersistence();
  const policy = new QueuePolicy({ persistence, runJob, now: clock.now });
  return { policy, clock, persistence, saves };
}

/** Drive a job through all 5 attempts so it lands in the dead-letter queue. */
async function exhaustToDeadLetter(runJob: QueueJobRunner = failingRunner) {
  const { policy, clock } = createPolicy(runJob);
  const { batchId } = await policy.submitBatch({
    requests: [postalRequest('j1')],
    priority: 1,
    tags: [],
  });
  const jobId = `${batchId}_job_0`;
  for (let attempt = 0; attempt < 5; attempt++) {
    await policy.processJobs({ maxJobs: 10 });
  }
  return { policy, clock, jobId, batchId };
}

describe('QueuePolicy priority ordering', () => {
  it('processes higher-priority jobs first across all priority queues', async () => {
    const { policy } = createPolicy();

    await policy.submitBatch({ requests: [postalRequest('a1'), postalRequest('a2')], priority: 1, tags: [] });
    await policy.submitBatch({ requests: [postalRequest('b1')], priority: 5, tags: [] });
    await policy.submitBatch({
      requests: [postalRequest('c1'), postalRequest('c2'), postalRequest('c3')],
      priority: 3,
      tags: [],
    });

    const result = await policy.processJobs({ maxJobs: 10 });
    const priorities = result.results.map((entry) => policy.getJob(entry.jobId)!.priority);

    expect(priorities).toEqual([5, 3, 3, 3, 1, 1]);
    expect(result.queueStats.pendingJobs).toBe(0);
  });

  it('restricts processing to a specific priority when asked', async () => {
    const { policy } = createPolicy();

    await policy.submitBatch({ requests: [postalRequest('p1')], priority: 1, tags: [] });
    await policy.submitBatch({ requests: [postalRequest('p3a'), postalRequest('p3b')], priority: 3, tags: [] });
    await policy.submitBatch({ requests: [postalRequest('p9')], priority: 9, tags: [] });

    const result = await policy.processJobs({ maxJobs: 10, priority: 3 });

    expect(result.results).toHaveLength(2);
    expect(result.results.every((entry) => policy.getJob(entry.jobId)!.priority === 3)).toBe(true);
    // The higher and lower priority queues are untouched.
    expect(policy.getStats().pendingJobs).toBe(2);
  });

  it('respects maxJobs, draining the retry queue first', async () => {
    const alreadyFailed = new Set<string>();
    const { policy } = createPolicy(async (job) => {
      if (job.request.id === 'retry-me' && !alreadyFailed.has('retry-me')) {
        alreadyFailed.add('retry-me');
        throw new Error('once');
      }
      return { id: job.request.id, query: job.request.query, properties: {}, processingTime: 0 };
    });

    const { batchId: retryBatchId } = await policy.submitBatch({
      requests: [postalRequest('retry-me')],
      priority: 1,
      tags: [],
    });
    await policy.submitBatch({ requests: [postalRequest('queued')], priority: 1, tags: [] });

    // First pass: 'retry-me' fails and moves to the retry queue.
    await policy.processJobs({ maxJobs: 1 });
    expect(policy.getStats().retryQueueSize).toBe(1);

    // Second pass with a single slot must take the retry before the pending job.
    const result = await policy.processJobs({ maxJobs: 1 });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].jobId).toBe(`${retryBatchId}_job_0`);
    expect(result.queueStats.retryQueueSize).toBe(0);
  });
});

describe('QueuePolicy retry and backoff', () => {
  it('caps exponential backoff at 30 seconds', () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(calculateRetryDelay)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
  });

  it('requeues a failed job with growing backoff before dead-lettering it', async () => {
    const clock = createClock(1_000_000);
    const { persistence } = createPersistence();
    const policy = new QueuePolicy({ persistence, runJob: failingRunner, now: clock.now });

    const { batchId } = await policy.submitBatch({
      requests: [postalRequest('j1')],
      priority: 1,
      tags: [],
    });
    const jobId = `${batchId}_job_0`;
    const expectedDelays = [1000, 2000, 4000, 8000];

    for (let attempt = 1; attempt <= expectedDelays.length; attempt++) {
      const result = await policy.processJobs({ maxJobs: 10 });
      expect(result.results[0]).toMatchObject({ jobId, status: 'failed', attempts: attempt });

      const job = policy.getJob(jobId)!;
      expect(job.status).toBe('retrying');
      expect(job.lastError).toBe('boom');
      expect(job.nextRetryAt).toBe(clock.now() + expectedDelays[attempt - 1]);
      expect(policy.getStats().retryQueueSize).toBe(1);

      clock.advance(expectedDelays[attempt - 1]);
    }

    // Fifth attempt exhausts maxAttempts and lands in the dead-letter queue.
    const finalResult = await policy.processJobs({ maxJobs: 10 });
    expect(finalResult.results[0]).toMatchObject({ jobId, status: 'failed', attempts: 5 });

    const dead = policy.getJob(jobId)!;
    expect(dead.status).toBe('dead_letter');
    expect(dead.completedAt).toBeDefined();
    expect(policy.getStats().retryQueueSize).toBe(0);
    expect(policy.getStats().deadLetterQueueSize).toBe(1);
  });

  it('retryFailed resets failed/retrying jobs back to pending', async () => {
    const { policy } = createPolicy(failingRunner);
    const { batchId } = await policy.submitBatch({
      requests: [postalRequest('j1')],
      priority: 2,
      tags: [],
    });
    const jobId = `${batchId}_job_0`;

    await policy.processJobs({ maxJobs: 10 });
    const retryResult = await policy.retryFailed([jobId]);

    expect(retryResult).toEqual({ message: 'Retried 1 jobs', retriedCount: 1 });
    const job = policy.getJob(jobId)!;
    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(0);
    expect(job.error).toBeUndefined();
    expect(job.nextRetryAt).toBeUndefined();

    // Unknown ids are ignored.
    expect(await policy.retryFailed(['missing'])).toEqual({ message: 'Retried 0 jobs', retriedCount: 0 });
  });
});

describe('QueuePolicy dead-letter transitions', () => {
  it('lists dead-lettered jobs with their failure history', async () => {
    const { policy, jobId } = await exhaustToDeadLetter();

    const listed = policy.listDeadLetter({ limit: 50, offset: 0 });
    expect(listed.total).toBe(1);
    expect(listed.deadLetterJobs[0]).toMatchObject({ id: jobId, attempts: 5, lastError: 'boom', priority: 1 });
  });

  it('retryDeadLetter returns a job to the priority queue and it can complete', async () => {
    let calls = 0;
    const flaky: QueueJobRunner = async (job) => {
      calls++;
      if (calls <= 5) throw new Error('boom');
      return { id: job.request.id, query: job.request.query, properties: {}, processingTime: 0 };
    };
    const { policy, jobId } = await exhaustToDeadLetter(flaky);

    const retryResult = await policy.retryDeadLetter({ jobIds: [jobId] });
    expect(retryResult).toEqual({
      message: 'Retried 1 dead letter jobs',
      retriedCount: 1,
      results: [{ jobId, status: 'retried', priority: 1 }],
    });

    const revived = policy.getJob(jobId)!;
    expect(revived.status).toBe('pending');
    expect(revived.attempts).toBe(0);
    expect(revived.lastError).toBeUndefined();
    expect(policy.listDeadLetter({ limit: 50, offset: 0 }).total).toBe(0);

    await policy.processJobs({ maxJobs: 10 });
    expect(policy.getJob(jobId)!.status).toBe('completed');
  });

  it('honours resetAttempts:false and newPriority', async () => {
    const { policy, jobId } = await exhaustToDeadLetter();

    const retryResult = await policy.retryDeadLetter({ jobIds: [jobId], resetAttempts: false, newPriority: 9 });

    expect(retryResult.results[0]).toEqual({ jobId, status: 'retried', priority: 9 });
    const job = policy.getJob(jobId)!;
    expect(job.attempts).toBe(5);
    expect(job.priority).toBe(9);
  });

  it('reports ids that are not dead-lettered', async () => {
    const { policy } = createPolicy();
    const result = await policy.retryDeadLetter({ jobIds: ['ghost'] });
    expect(result.retriedCount).toBe(0);
    expect(result.results).toEqual([{ jobId: 'ghost', status: 'not_found_or_not_dead_letter' }]);
  });
});

describe('QueuePolicy batch aggregation', () => {
  it('groups requests by pathname and query pattern', async () => {
    const { policy } = createPolicy();

    const result = await policy.submitBatch({
      requests: [
        postalRequest('p1'),
        postalRequest('p2', 'K1A 0A6'),
        { id: 'c1', query: { lat: 45, lon: -75 }, pathname: '/api/federal' },
        { id: 'a1', query: { address: '123 Main St' }, pathname: '/api/federal' },
        { id: 'o1', query: { postal: 'M5V 2T6' }, pathname: '/api/provincial' },
      ],
      priority: 1,
      tags: ['smoke'],
    });

    expect(result).toMatchObject({
      totalJobs: 5,
      groupedJobs: 4,
      status: 'submitted',
      message: 'Batch submitted successfully with optimization',
    });

    // Group key is recorded as the trailing tag; fallback id is applied.
    expect(policy.getJob(`${result.batchId}_job_0`)!.tags).toEqual(['smoke', '/api/federal:postal']);
    expect(policy.getJob(`${result.batchId}_job_0`)!.request.id).toBe('p1');
  });

  it('aggregates completed jobs into the batch', async () => {
    const { policy } = createPolicy();
    const { batchId } = await policy.submitBatch({
      requests: [postalRequest('a'), postalRequest('b')],
      priority: 2,
      tags: [],
    });

    const result = await policy.processJobs({ maxJobs: 10 });
    expect(result.results.map((entry) => entry.status)).toEqual(['completed', 'completed']);

    const batch = policy.getBatch(batchId)!;
    expect(batch).toMatchObject({ status: 'completed', completedJobs: 2, failedJobs: 0 });
    expect(batch.completedAt).toBeDefined();
    expect(batch.results).toHaveLength(2);
    expect(batch.errors).toEqual([]);
  });

  it('marks a batch partially_completed when some jobs fail', async () => {
    let calls = 0;
    const mostlyFailing: QueueJobRunner = async (job) => {
      calls++;
      if (job.request.id === 'a' && calls === 1) throw new Error('boom');
      return { id: job.request.id, query: job.request.query, properties: {}, processingTime: 0 };
    };
    const { policy } = createPolicy(mostlyFailing);
    const { batchId } = await policy.submitBatch({
      requests: [postalRequest('a'), postalRequest('b')],
      priority: 1,
      tags: [],
    });

    const result = await policy.processJobs({ maxJobs: 10 });
    expect(result.results.map((entry) => entry.status)).toEqual(['failed', 'completed']);

    const batch = policy.getBatch(batchId)!;
    expect(batch.status).toBe('partially_completed');
    expect(batch.completedJobs).toBe(1);
    expect(batch.failedJobs).toBe(1);
    expect(batch.errors[0]).toContain('boom');
  });
});

describe('QueuePolicy stats', () => {
  it('reports counts, priority distribution and success rate', async () => {
    const clock = createClock(2_000_000);
    const { persistence } = createPersistence();
    const policy = new QueuePolicy({ persistence, runJob: successRunner, now: clock.now });

    await policy.submitBatch({ requests: [postalRequest('a')], priority: 5, tags: [] });
    await policy.submitBatch({ requests: [postalRequest('b'), postalRequest('c')], priority: 1, tags: [] });

    const pending = policy.getStats();
    expect(pending).toMatchObject({
      totalJobs: 3,
      pendingJobs: 3,
      completedJobs: 0,
      successRate: 0,
      retryQueueSize: 0,
      deadLetterQueueSize: 0,
    });
    expect(pending.priorityDistribution).toEqual({ 5: 1, 1: 2 });

    await policy.processJobs({ maxJobs: 10 });

    const done = policy.getStats();
    expect(done).toMatchObject({
      totalJobs: 3,
      pendingJobs: 0,
      completedJobs: 3,
      successRate: 100,
      errorRate: 0,
      // 3 jobs in the 1s minimum throughput window → 180 jobs/min
      throughput: 180,
    });
    expect(done.priorityDistribution).toEqual({});
  });

  it('reads the clock once per stats pass so an empty queue reports no oldest job', () => {
    // A clock that advances on every read: if `updateStats` called `now()`
    // twice for the `oldestPendingJob === now` comparison it would see two
    // different instants and report a spurious nonzero age for an empty queue.
    let tick = 1000;
    const now = () => tick++;
    const { persistence } = createPersistence();
    const policy = new QueuePolicy({ persistence, runJob: successRunner, now });

    expect(policy.getStats().oldestPendingJob).toBe(0);
  });

  it('reports queue lengths in the health envelope', async () => {
    const { policy } = createPolicy();
    await policy.submitBatch({ requests: [postalRequest('a')], priority: 1, tags: [] });

    const health = policy.getHealth();
    expect(health.status).toBe('healthy');
    expect(health.timestamp).toBe(1_000_000_000);
    expect(health.queueLengths).toEqual({ processing: 0, retry: 0, deadLetter: 0 });
    expect(health.stats.pendingJobs).toBe(1);
  });
});

describe('QueuePolicy persistence', () => {
  it('round-trips through the injected storage adapter', async () => {
    const clock = createClock();
    const { persistence, saves } = createPersistence();

    const first = new QueuePolicy({ persistence, runJob: successRunner, now: clock.now });
    const { batchId } = await first.submitBatch({
      requests: [postalRequest('a'), postalRequest('b')],
      priority: 1,
      tags: [],
    });
    expect(saves).toHaveLength(1);

    const second = new QueuePolicy({ persistence, runJob: successRunner, now: clock.now });
    await second.load();

    expect(second.getBatch(batchId)!.totalJobs).toBe(2);
    expect(second.getStats().pendingJobs).toBe(2);

    const result = await second.processJobs({ maxJobs: 10 });
    expect(result.results).toHaveLength(2);
    // Processing persisted the updated state.
    expect(saves.length).toBeGreaterThanOrEqual(2);
  });
});

describe('QueueManagerDO adapter', () => {
  function fakeState() {
    const store = new Map<string, unknown>();
    const state = {
      storage: {
        get: async (key: string) => store.get(key),
        put: async (key: string, value: unknown) => {
          store.set(key, value);
        },
      },
    } as unknown as DurableObjectState;
    return { state, store };
  }

  /** Submit one postal request (needs geocoding) and return its job id. */
  async function submitPostal(manager: QueueManagerDO, id = 'r1'): Promise<string> {
    const submit = await manager.fetch(
      new Request('https://queue.local/queue/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requests: [{ id, query: { postal: 'M5V 2T6' }, pathname: '/api/federal' }],
        }),
      })
    );
    expect(submit.status).toBe(200);
    const submitted = (await submit.json()) as { batchId: string };
    return `${submitted.batchId}_job_0`;
  }

  async function processOnce(manager: QueueManagerDO): Promise<ProcessJobsResult> {
    const response = await manager.fetch(
      new Request('https://queue.local/queue/process', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ maxJobs: 10 }),
      })
    );
    expect(response.status).toBe(200);
    return (await response.json()) as ProcessJobsResult;
  }

  async function readJob(manager: QueueManagerDO, jobId: string): Promise<QueueJob> {
    const response = await manager.fetch(
      new Request(`https://queue.local/queue/job?id=${encodeURIComponent(jobId)}`)
    );
    expect(response.status).toBe(200);
    return (await response.json()) as QueueJob;
  }

  it('keeps the exported class name and delegates /queue/submit + /queue/status', async () => {
    expect(QueueManagerDO.name).toBe('QueueManager');

    const { state } = fakeState();
    const manager = new QueueManagerDO(state, {} as Env);

    const submit = await manager.fetch(
      new Request('https://queue.local/queue/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requests: [{ id: 'r1', query: { postal: 'M5V 2T6' }, pathname: '/api/federal' }],
        }),
      })
    );
    expect(submit.status).toBe(200);
    const submitted = (await submit.json()) as { batchId: string; totalJobs: number };
    expect(submitted.totalJobs).toBe(1);

    const status = await manager.fetch(
      new Request(`https://queue.local/queue/status?batchId=${submitted.batchId}`)
    );
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ totalJobs: 1, status: 'pending' });
  });

  it('preserves 404 and 405 handling', async () => {
    const { state } = fakeState();
    const manager = new QueueManagerDO(state, {} as Env);

    const notFound = await manager.fetch(new Request('https://queue.local/unknown'));
    expect(notFound.status).toBe(404);

    const wrongMethod = await manager.fetch(new Request('https://queue.local/queue/submit'));
    expect(wrongMethod.status).toBe(405);
  });

  it('rejects a genuine lookup failure through the real runner so the policy retries it', async () => {
    const { state } = fakeState();
    // An empty env has no geocoding budget, so this postal request cannot be
    // resolved to coordinates and `performExpandedLookup` rejects. That is the
    // production runner failing: the DO must surface it as a rejected promise
    // (not a completed job carrying an error body), which is what retries.
    const manager = new QueueManagerDO(state, {} as Env);
    const jobId = await submitPostal(manager);

    const result = await processOnce(manager);
    expect(result.results[0]).toMatchObject({ jobId, status: 'failed', attempts: 1 });
    expect(result.results[0].error).toContain('Coordinates required');

    const job = await readJob(manager, jobId);
    expect(job.status).toBe('retrying');
    expect(typeof job.nextRetryAt).toBe('number');
    expect(job.nextRetryAt).toBeGreaterThan(job.completedAt!);
    expect(job.lastError).toContain('Coordinates required');
  });

  it('dead-letters a persistently failing lookup after maxAttempts', async () => {
    const { state } = fakeState();
    const manager = new QueueManagerDO(state, {} as Env);
    const jobId = await submitPostal(manager);

    // First pass is the initial attempt; the next four drain the retry queue.
    // The fifth attempt exhausts maxAttempts and must dead-letter the job.
    for (let attempt = 0; attempt < 5; attempt++) {
      await processOnce(manager);
    }

    const dead = await readJob(manager, jobId);
    expect(dead.status).toBe('dead_letter');
    expect(dead.attempts).toBe(5);
    expect(dead.lastError).toContain('Coordinates required');

    const dlqResponse = await manager.fetch(
      new Request('https://queue.local/queue/dead-letter?limit=50&offset=0')
    );
    expect(dlqResponse.status).toBe(200);
    const dlq = (await dlqResponse.json()) as DeadLetterResult;
    expect(dlq.total).toBe(1);
    expect(dlq.deadLetterJobs[0]).toMatchObject({ id: jobId, attempts: 5 });
  });
});
