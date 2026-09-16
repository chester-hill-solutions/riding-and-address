import type { BatchLookupRequest, BatchLookupResponse } from './types';

/**
 * Shared wire contract for the QueueManager Durable Object (`main-queue`).
 *
 * This is the single source of truth for the DO's response envelopes. It has no
 * runtime imports (the `types.ts` import is type-only, so it is erased), which
 * lets both the DO (`queue-manager.ts`) and its client (`queue-client.ts`) check
 * the same shapes without either side depending on the other's module graph.
 *
 * Note: the DO's `BatchJob` is deliberately distinct from `types.ts`'s
 * synchronous/API `BatchJob` — the DO tracks `totalJobs`/`completedJobs`/
 * `failedJobs` and a `partially_completed` status, and does not carry `requests`.
 */

export interface QueueJob {
  id: string;
  batchId: string;
  request: BatchLookupRequest;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying' | 'dead_letter';
  priority: number; // Higher number = higher priority
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  nextRetryAt?: number;
  result?: BatchLookupResponse;
  error?: string;
  processingTime?: number;
  lastError?: string;
  errorCount: number;
  tags?: string[];
}

export interface BatchJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partially_completed';
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  results: BatchLookupResponse[];
  errors: string[];
}

export interface QueueStats {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  retryingJobs: number;
  deadLetterJobs: number;
  averageProcessingTime: number;
  successRate: number;
  priorityDistribution: Record<number, number>;
  errorRate: number;
  throughput: number; // jobs per minute
  oldestPendingJob: number;
  deadLetterQueueSize: number;
  retryQueueSize: number;
}

/** `POST /queue/submit` */
export interface SubmitBatchResult {
  batchId: string;
  totalJobs: number;
  groupedJobs: number;
  status: 'submitted';
  message: string;
}

/** `POST /queue/retry` */
export interface RetryFailedResult {
  message: string;
  retriedCount: number;
}

/** One processed job inside a `POST /queue/process` response. */
export interface ProcessedJobResult {
  jobId: string;
  status: string;
  result?: BatchLookupResponse;
  processingTime?: number;
  error?: string;
  attempts?: number;
}

/** `POST /queue/process` */
export interface ProcessJobsResult {
  processedJobs: number;
  processingTime: number;
  results: ProcessedJobResult[];
  queueStats: {
    pendingJobs: number;
    retryQueueSize: number;
    deadLetterQueueSize: number;
  };
}

/** `GET /queue/health` */
export interface QueueHealth {
  status: string;
  timestamp: number;
  stats: QueueStats;
  queueLengths: {
    processing: number;
    retry: number;
    deadLetter: number;
  };
}

/** One entry inside a `GET /queue/dead-letter` response. */
export interface DeadLetterJob {
  id: string;
  batchId: string;
  priority: number;
  attempts: number;
  createdAt: number;
  completedAt?: number;
  lastError?: string;
  errorCount: number;
  tags?: string[];
  request: BatchLookupRequest;
}

/** `GET /queue/dead-letter` */
export interface DeadLetterResult {
  deadLetterJobs: DeadLetterJob[];
  total: number;
  limit: number;
  offset: number;
}

/** `POST /queue/retry-dead-letter` */
export interface RetryDeadLetterResult {
  message: string;
  retriedCount: number;
  results: Array<{ jobId: string; status: string; priority?: number }>;
}
