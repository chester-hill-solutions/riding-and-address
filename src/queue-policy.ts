import type { BatchLookupRequest, BatchLookupResponse, QueryParams } from './types';
import type {
  BatchJob,
  DeadLetterJob,
  DeadLetterResult,
  ProcessedJobResult,
  ProcessJobsResult,
  QueueHealth,
  QueueJob,
  QueueStats,
  RetryDeadLetterResult,
  RetryFailedResult,
  SubmitBatchResult,
} from './queue-types';

/**
 * The queue's policy, separated from the Durable Object that hosts it.
 *
 * This module owns priority ordering, retry/backoff, dead-letter transitions,
 * batch aggregation and stats. It reaches the outside world only through two
 * injected seams:
 *
 * - `QueuePersistence` — where a snapshot is read/written. The Durable Object
 *   implements it over `state.storage`; tests use an in-memory fake.
 * - `QueueJobRunner` — how one job is executed. The Durable Object binds the
 *   real `cachedLookupRiding` + `geocodeIfNeeded` runner; tests inject a fake.
 *
 * It deliberately does not import `Env`, the lookup modules, or `this.state`,
 * so the whole policy is reachable in-process without a Durable Object.
 */

/** Serialised form of the queue's in-memory state, as persisted under one key. */
export interface QueueStateSnapshot {
  jobs: [string, QueueJob][];
  batches: [string, BatchJob][];
  processingQueue: string[];
  retryQueue: string[];
  deadLetterQueue: string[];
  priorityQueues: [number, string[]][];
  lastProcessedTime: number;
  processedJobsCount: number;
}

/** Storage seam. The DO implements this over `state.storage`. */
export interface QueuePersistence {
  load(): Promise<QueueStateSnapshot | undefined>;
  save(snapshot: QueueStateSnapshot): Promise<void>;
}

/** Executes a single job and resolves with its lookup response. */
export type QueueJobRunner = (job: QueueJob) => Promise<BatchLookupResponse>;

export interface QueuePolicyDeps {
  persistence: QueuePersistence;
  runJob: QueueJobRunner;
  /** Clock seam; defaults to `Date.now`. Tests inject a controllable clock. */
  now?: () => number;
}

export interface SubmitBatchInput {
  requests: BatchLookupRequest[];
  priority: number;
  tags: string[];
}

export interface ProcessJobsInput {
  maxJobs: number;
  priority?: number | null;
}

export interface RetryDeadLetterInput {
  jobIds: string[];
  resetAttempts?: boolean;
  newPriority?: number | null;
}

export interface DeadLetterListInput {
  limit: number;
  offset: number;
}

const MAX_JOB_ATTEMPTS = 5;
const MAX_RETRY_DELAY_MS = 30000;

function emptyStats(): QueueStats {
  return {
    totalJobs: 0,
    pendingJobs: 0,
    processingJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    retryingJobs: 0,
    deadLetterJobs: 0,
    averageProcessingTime: 0,
    successRate: 0,
    priorityDistribution: {},
    errorRate: 0,
    throughput: 0,
    oldestPendingJob: 0,
    deadLetterQueueSize: 0,
    retryQueueSize: 0,
  };
}

/** Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s. */
export function calculateRetryDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt - 1), MAX_RETRY_DELAY_MS);
}

export class QueuePolicy {
  private readonly persistence: QueuePersistence;
  private readonly runJob: QueueJobRunner;
  private readonly now: () => number;

  private jobs = new Map<string, QueueJob>();
  private batches = new Map<string, BatchJob>();
  private processingQueue: string[] = [];
  private retryQueue: string[] = [];
  private deadLetterQueue: string[] = [];
  private priorityQueues = new Map<number, string[]>();
  private stats: QueueStats = emptyStats();
  private lastProcessedTime: number;
  private processedJobsCount = 0;

  constructor(deps: QueuePolicyDeps) {
    this.persistence = deps.persistence;
    this.runJob = deps.runJob;
    this.now = deps.now ?? Date.now;
    this.lastProcessedTime = this.now();
  }

  // -- Persistence (owned by the DO's adapter, decided here) ---------------

  async load(): Promise<void> {
    const stored = await this.persistence.load();
    if (!stored) return;

    this.jobs = new Map(stored.jobs || []);
    this.batches = new Map(stored.batches || []);
    this.processingQueue = stored.processingQueue || [];
    this.retryQueue = stored.retryQueue || [];
    this.deadLetterQueue = stored.deadLetterQueue || [];
    this.priorityQueues = new Map(stored.priorityQueues || []);
    this.lastProcessedTime = stored.lastProcessedTime || this.now();
    this.processedJobsCount = stored.processedJobsCount || 0;
  }

  async save(): Promise<void> {
    try {
      await this.persistence.save({
        jobs: Array.from(this.jobs.entries()),
        batches: Array.from(this.batches.entries()),
        processingQueue: this.processingQueue,
        retryQueue: this.retryQueue,
        deadLetterQueue: this.deadLetterQueue,
        priorityQueues: Array.from(this.priorityQueues.entries()),
        lastProcessedTime: this.lastProcessedTime,
        processedJobsCount: this.processedJobsCount,
      });
    } catch (error) {
      console.error('Error saving queue manager state:', error);
    }
  }

  // -- Reads ---------------------------------------------------------------

  getBatch(batchId: string): BatchJob | undefined {
    return this.batches.get(batchId);
  }

  getJob(jobId: string): QueueJob | undefined {
    return this.jobs.get(jobId);
  }

  getStats(): QueueStats {
    this.updateStats();
    return this.stats;
  }

  getHealth(): QueueHealth {
    return {
      status: 'healthy',
      timestamp: this.now(),
      stats: this.stats,
      queueLengths: {
        processing: this.processingQueue.length,
        retry: this.retryQueue.length,
        deadLetter: this.deadLetterQueue.length,
      },
    };
  }

  listDeadLetter(input: DeadLetterListInput): DeadLetterResult {
    const { limit, offset } = input;

    const deadLetterJobs = this.deadLetterQueue
      .slice(offset, offset + limit)
      .map((jobId): DeadLetterJob | null => {
        const job = this.jobs.get(jobId);
        if (!job) return null;

        return {
          id: job.id,
          batchId: job.batchId,
          priority: job.priority,
          attempts: job.attempts,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          lastError: job.lastError,
          errorCount: job.errorCount,
          tags: job.tags,
          request: job.request,
        };
      })
      .filter(Boolean) as DeadLetterJob[];

    return {
      deadLetterJobs,
      total: this.deadLetterQueue.length,
      limit,
      offset,
    };
  }

  // -- Writes --------------------------------------------------------------

  async submitBatch(input: SubmitBatchInput): Promise<SubmitBatchResult> {
    const { requests, priority, tags } = input;

    const batchId = `batch_${this.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const batchJob: BatchJob = {
      id: batchId,
      status: 'pending',
      totalJobs: requests.length,
      completedJobs: 0,
      failedJobs: 0,
      createdAt: this.now(),
      results: [],
      errors: [],
    };

    // Group similar requests for optimization
    const groupedRequests = this.groupSimilarRequests(requests);
    let jobIndex = 0;

    for (const [groupKey, groupRequests] of groupedRequests) {
      for (const req of groupRequests) {
        const jobId = `${batchId}_job_${jobIndex}`;

        const job: QueueJob = {
          id: jobId,
          batchId,
          request: {
            id: req.id || `req_${jobIndex}`,
            query: req.query,
            pathname: req.pathname,
          },
          status: 'pending',
          priority,
          attempts: 0,
          maxAttempts: MAX_JOB_ATTEMPTS,
          createdAt: this.now(),
          errorCount: 0,
          tags: [...tags, groupKey], // Add group key as tag
        };

        this.jobs.set(jobId, job);
        this.addToPriorityQueue(jobId, priority);
        jobIndex++;
      }
    }

    this.batches.set(batchId, batchJob);
    this.updateStats();
    await this.save();

    return {
      batchId,
      totalJobs: requests.length,
      groupedJobs: groupedRequests.size,
      status: 'submitted',
      message: 'Batch submitted successfully with optimization',
    };
  }

  async retryFailed(jobIds: string[]): Promise<RetryFailedResult> {
    let retriedCount = 0;
    for (const jobId of jobIds) {
      const job = this.jobs.get(jobId);
      if (job && (job.status === 'failed' || job.status === 'retrying')) {
        job.status = 'pending';
        job.attempts = 0;
        job.error = undefined;
        job.nextRetryAt = undefined;
        this.processingQueue.push(jobId);
        retriedCount++;
      }
    }

    this.updateStats();
    await this.save();

    return {
      message: `Retried ${retriedCount} jobs`,
      retriedCount,
    };
  }

  async processJobs(input: ProcessJobsInput): Promise<ProcessJobsResult> {
    const { maxJobs, priority = null } = input;

    const jobsToProcess: string[] = [];

    // Process retry queue first
    const retryJobs = this.retryQueue.splice(0, Math.min(maxJobs, this.retryQueue.length));
    jobsToProcess.push(...retryJobs);

    // Then process priority queues
    const remainingSlots = maxJobs - jobsToProcess.length;
    if (remainingSlots > 0) {
      const priorityJobs = this.getJobsFromPriorityQueues(remainingSlots, priority);
      jobsToProcess.push(...priorityJobs);
    }

    const results: ProcessedJobResult[] = [];
    const startTime = this.now();

    for (const jobId of jobsToProcess) {
      const job = this.jobs.get(jobId);
      if (!job) continue;

      try {
        job.status = 'processing';
        job.startedAt = this.now();
        job.attempts++;

        const result = await this.runJob(job);

        job.status = 'completed';
        job.completedAt = this.now();
        job.result = result;
        job.processingTime = job.completedAt - job.startedAt!;
        job.errorCount = 0; // Reset error count on success

        // Update batch
        const batch = this.batches.get(job.batchId);
        if (batch) {
          batch.completedJobs++;
          batch.results.push(result);
          if (batch.completedJobs + batch.failedJobs >= batch.totalJobs) {
            batch.status = batch.failedJobs > 0 ? 'partially_completed' : 'completed';
            batch.completedAt = this.now();
          }
        }

        results.push({ jobId, status: 'completed', result, processingTime: job.processingTime });
      } catch (error) {
        job.errorCount++;
        job.lastError = error instanceof Error ? error.message : String(error);
        job.completedAt = this.now();

        // Check if we should retry
        if (job.attempts < job.maxAttempts) {
          job.status = 'retrying';
          job.nextRetryAt = this.now() + calculateRetryDelay(job.attempts);
          this.retryQueue.push(jobId);
        } else {
          // Move to dead letter queue
          this.moveToDeadLetterQueue(jobId);
        }

        // Update batch
        const batch = this.batches.get(job.batchId);
        if (batch) {
          batch.failedJobs++;
          batch.errors.push(`${jobId}: ${error instanceof Error ? error.message : String(error)}`);
          if (batch.completedJobs + batch.failedJobs >= batch.totalJobs) {
            batch.status = batch.completedJobs > 0 ? 'partially_completed' : 'failed';
            batch.completedAt = this.now();
          }
        }

        results.push({
          jobId,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          attempts: job.attempts,
        });
      }
    }

    // Update throughput metrics
    const processingTime = this.now() - startTime;
    this.processedJobsCount += results.length;
    this.lastProcessedTime = this.now();

    this.updateStats();
    await this.save();

    return {
      processedJobs: results.length,
      processingTime,
      results,
      queueStats: {
        pendingJobs: this.getTotalPendingJobs(),
        retryQueueSize: this.retryQueue.length,
        deadLetterQueueSize: this.deadLetterQueue.length,
      },
    };
  }

  async retryDeadLetter(input: RetryDeadLetterInput): Promise<RetryDeadLetterResult> {
    const { jobIds, resetAttempts = true, newPriority = null } = input;

    let retriedCount = 0;
    const results: Array<{ jobId: string; status: string; priority?: number }> = [];

    for (const jobId of jobIds) {
      const job = this.jobs.get(jobId);
      if (job && job.status === 'dead_letter') {
        // Reset job status
        job.status = 'pending';
        if (resetAttempts) {
          job.attempts = 0;
          job.errorCount = 0;
        }
        job.lastError = undefined;
        job.nextRetryAt = undefined;

        // Update priority if specified
        if (newPriority !== null) {
          job.priority = newPriority;
        }

        // Remove from dead letter queue
        const deadLetterIndex = this.deadLetterQueue.indexOf(jobId);
        if (deadLetterIndex > -1) {
          this.deadLetterQueue.splice(deadLetterIndex, 1);
        }

        // Add back to priority queue
        this.addToPriorityQueue(jobId, job.priority);

        retriedCount++;
        results.push({ jobId, status: 'retried', priority: job.priority });
      } else {
        results.push({ jobId, status: 'not_found_or_not_dead_letter' });
      }
    }

    this.updateStats();
    await this.save();

    return {
      message: `Retried ${retriedCount} dead letter jobs`,
      retriedCount,
      results,
    };
  }

  // -- Policy internals ----------------------------------------------------

  private addToPriorityQueue(jobId: string, priority: number): void {
    if (!this.priorityQueues.has(priority)) {
      this.priorityQueues.set(priority, []);
    }
    this.priorityQueues.get(priority)!.push(jobId);
  }

  private removeFromPriorityQueue(jobId: string, priority: number): void {
    const queue = this.priorityQueues.get(priority);
    if (queue) {
      const index = queue.indexOf(jobId);
      if (index > -1) {
        queue.splice(index, 1);
      }
    }
  }

  private moveToDeadLetterQueue(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'dead_letter';
    job.completedAt = this.now();

    // Remove from all queues
    this.removeFromPriorityQueue(jobId, job.priority);
    const retryIndex = this.retryQueue.indexOf(jobId);
    if (retryIndex > -1) {
      this.retryQueue.splice(retryIndex, 1);
    }

    // Add to dead letter queue
    this.deadLetterQueue.push(jobId);

    console.warn(`Job ${jobId} moved to dead letter queue after ${job.attempts} attempts`);
  }

  private getJobsFromPriorityQueues(maxJobs: number, specificPriority: number | null = null): string[] {
    const jobs: string[] = [];

    if (specificPriority !== null) {
      // Get jobs from specific priority queue
      const queue = this.priorityQueues.get(specificPriority);
      if (queue) {
        const availableJobs = queue.splice(0, maxJobs);
        jobs.push(...availableJobs);
      }
    } else {
      // Get jobs from all priority queues in order
      const priorities = Array.from(this.priorityQueues.keys()).sort((a, b) => b - a);

      for (const priority of priorities) {
        if (jobs.length >= maxJobs) break;

        const queue = this.priorityQueues.get(priority);
        if (queue && queue.length > 0) {
          const remainingSlots = maxJobs - jobs.length;
          const availableJobs = queue.splice(0, remainingSlots);
          jobs.push(...availableJobs);
        }
      }
    }

    return jobs;
  }

  private getTotalPendingJobs(): number {
    let total = 0;
    for (const queue of this.priorityQueues.values()) {
      total += queue.length;
    }
    return total;
  }

  // Batch optimization
  private groupSimilarRequests(requests: BatchLookupRequest[]): Map<string, BatchLookupRequest[]> {
    const groups = new Map<string, BatchLookupRequest[]>();

    for (const request of requests) {
      // Group by pathname and similar query patterns
      const key = `${request.pathname}:${this.getQueryPattern(request.query)}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(request);
    }

    return groups;
  }

  private getQueryPattern(query: QueryParams): string {
    // Create a pattern based on query type for grouping
    if (query.lat !== undefined && query.lon !== undefined) {
      return 'coordinates';
    } else if (query.postal) {
      return 'postal';
    } else if (query.address) {
      return 'address';
    } else {
      return 'mixed';
    }
  }

  private updateStats(): void {
    let totalJobs = 0;
    let pendingJobs = 0;
    let processingJobs = 0;
    let completedJobs = 0;
    let failedJobs = 0;
    let retryingJobs = 0;
    let deadLetterJobs = 0;
    let totalProcessingTime = 0;
    let completedCount = 0;
    let errorCount = 0;
    const priorityDistribution: Record<number, number> = {};
    let oldestPendingJob = this.now();

    for (const job of this.jobs.values()) {
      totalJobs++;
      totalProcessingTime += job.processingTime || 0;

      // Track priority distribution
      if (job.status === 'pending' || job.status === 'processing') {
        priorityDistribution[job.priority] = (priorityDistribution[job.priority] || 0) + 1;
        if (job.createdAt < oldestPendingJob) {
          oldestPendingJob = job.createdAt;
        }
      }

      // Count errors
      errorCount += job.errorCount || 0;

      switch (job.status) {
        case 'pending':
          pendingJobs++;
          break;
        case 'processing':
          processingJobs++;
          break;
        case 'completed':
          completedJobs++;
          completedCount++;
          break;
        case 'failed':
          failedJobs++;
          break;
        case 'retrying':
          retryingJobs++;
          break;
        case 'dead_letter':
          deadLetterJobs++;
          break;
      }
    }

    // Calculate throughput (jobs per minute)
    // Use a minimum time window of 1 second to avoid division by zero
    const timeSinceLastProcessed = Math.max(this.now() - this.lastProcessedTime, 1000);
    const throughput = this.processedJobsCount > 0 && timeSinceLastProcessed > 0 ?
      (this.processedJobsCount * 60000) / timeSinceLastProcessed : 0;

    this.stats = {
      totalJobs,
      pendingJobs,
      processingJobs,
      completedJobs,
      failedJobs,
      retryingJobs,
      deadLetterJobs,
      averageProcessingTime: completedCount > 0 ? totalProcessingTime / completedCount : 0,
      successRate: totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0,
      priorityDistribution,
      errorRate: totalJobs > 0 ? (errorCount / totalJobs) * 100 : 0,
      throughput,
      oldestPendingJob: oldestPendingJob === this.now() ? 0 : this.now() - oldestPendingJob,
      deadLetterQueueSize: this.deadLetterQueue.length,
      retryQueueSize: this.retryQueue.length,
    };
  }
}
