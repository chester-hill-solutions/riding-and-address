/// <reference types="@cloudflare/workers-types" />

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

export interface BatchLookupRequest {
  id: string;
  query: QueryParams;
  pathname: string;
}

export interface BatchLookupResponse {
  id: string;
  query: QueryParams;
  point?: { lon: number; lat: number };
  properties: Record<string, unknown> | null;
  normalizedAddress?: string;
  error?: string;
  processingTime: number;
}

export interface QueryParams {
  address?: string;
  postal?: string;
  lat?: number;
  lon?: number;
  city?: string;
  state?: string;
  country?: string;
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

export class QueueManager {
  private state: DurableObjectState;
  private env: any;
  private jobs: Map<string, QueueJob> = new Map();
  private batches: Map<string, BatchJob> = new Map();
  private processingQueue: string[] = [];
  private retryQueue: string[] = [];
  private deadLetterQueue: string[] = [];
  private priorityQueues: Map<number, string[]> = new Map();
  private stats: QueueStats = {
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
    retryQueueSize: 0
  };
  private lastProcessedTime: number = Date.now();
  private processedJobsCount: number = 0;
  private stateLoadPromise: Promise<void> | null = null;
  private stateLoaded: boolean = false;
  private stateLoadError: Error | null = null;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    // Load persisted state on initialization and store the promise
    this.stateLoadPromise = this.loadStateWithRetry();
  }

  // Load state from Durable Object storage with retry logic
  private async loadStateWithRetry(maxRetries: number = 3): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.loadState();
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

  // Load state from Durable Object storage
  private async loadState(): Promise<void> {
    const stored = await this.state.storage.get<{
      jobs: [string, QueueJob][];
      batches: [string, BatchJob][];
      processingQueue: string[];
      retryQueue: string[];
      deadLetterQueue: string[];
      priorityQueues: [number, string[]][];
      lastProcessedTime: number;
      processedJobsCount: number;
    }>('queueState');
    
    if (stored) {
      this.jobs = new Map(stored.jobs || []);
      this.batches = new Map(stored.batches || []);
      this.processingQueue = stored.processingQueue || [];
      this.retryQueue = stored.retryQueue || [];
      this.deadLetterQueue = stored.deadLetterQueue || [];
      this.priorityQueues = new Map(stored.priorityQueues || []);
      this.lastProcessedTime = stored.lastProcessedTime || Date.now();
      this.processedJobsCount = stored.processedJobsCount || 0;
    }
  }

  // Save state to Durable Object storage
  private async saveState(): Promise<void> {
    try {
      await this.state.storage.put('queueState', {
        jobs: Array.from(this.jobs.entries()),
        batches: Array.from(this.batches.entries()),
        processingQueue: this.processingQueue,
        retryQueue: this.retryQueue,
        deadLetterQueue: this.deadLetterQueue,
        priorityQueues: Array.from(this.priorityQueues.entries()),
        lastProcessedTime: this.lastProcessedTime,
        processedJobsCount: this.processedJobsCount
      });
    } catch (error) {
      console.error('Error saving queue manager state:', error);
    }
  }

  // Priority queue management
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

  private getNextJobFromPriorityQueues(): string | null {
    // Get all priority levels sorted in descending order (highest first)
    const priorities = Array.from(this.priorityQueues.keys()).sort((a, b) => b - a);
    
    for (const priority of priorities) {
      const queue = this.priorityQueues.get(priority);
      if (queue && queue.length > 0) {
        return queue.shift()!;
      }
    }
    
    return null;
  }

  // Dead letter queue management
  private moveToDeadLetterQueue(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'dead_letter';
    job.completedAt = Date.now();
    
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
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'Request body too large. Maximum size is 10MB' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json() as { requests: BatchLookupRequest[]; priority?: number; tags?: string[] };
    const { requests, priority = 1, tags = [] } = body;

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

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const batchJob: BatchJob = {
      id: batchId,
      status: 'pending',
      totalJobs: requests.length,
      completedJobs: 0,
      failedJobs: 0,
      createdAt: Date.now(),
      results: [],
      errors: []
    };

    // Group similar requests for optimization
    const groupedRequests = this.groupSimilarRequests(requests);
    const jobIds: string[] = [];
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
            pathname: req.pathname
          },
          status: 'pending',
          priority: priority,
          attempts: 0,
          maxAttempts: 5, // Configurable
          createdAt: Date.now(),
          errorCount: 0,
          tags: [...tags, groupKey] // Add group key as tag
        };

        this.jobs.set(jobId, job);
        this.addToPriorityQueue(jobId, priority);
        jobIds.push(jobId);
        jobIndex++;
      }
    }

    this.batches.set(batchId, batchJob);
    this.updateStats();
    await this.saveState(); // Persist state after adding batch

    return new Response(JSON.stringify({
      batchId,
      totalJobs: requests.length,
      groupedJobs: groupedRequests.size,
      status: 'submitted',
      message: 'Batch submitted successfully with optimization'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleGetStatus(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const batchId = url.searchParams.get('batchId');
    const jobId = url.searchParams.get('jobId');

    if (batchId) {
      const batch = this.batches.get(batchId);
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
      const job = this.jobs.get(jobId);
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

    const job = this.jobs.get(jobId);
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

    const batch = this.batches.get(batchId);
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
    this.updateStats();
    return new Response(JSON.stringify(this.stats), {
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
    await this.saveState(); // Persist state after retrying jobs

    return new Response(JSON.stringify({
      message: `Retried ${retriedCount} jobs`,
      retriedCount
    }), {
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

    const results: Array<{ jobId: string; status: string; result?: BatchLookupResponse; processingTime?: number; error?: string; attempts?: number }> = [];
    const startTime = Date.now();

    for (const jobId of jobsToProcess) {
      const job = this.jobs.get(jobId);
      if (!job) continue;

      try {
        job.status = 'processing';
        job.startedAt = Date.now();
        job.attempts++;

        // This would call the actual processing logic
        // For now, we'll simulate processing
        const result = await this.processJob(job);
        
        job.status = 'completed';
        job.completedAt = Date.now();
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
            batch.completedAt = Date.now();
          }
        }

        results.push({ jobId, status: 'completed', result, processingTime: job.processingTime });
      } catch (error) {
        job.errorCount++;
        job.lastError = error instanceof Error ? error.message : String(error);
        job.completedAt = Date.now();

        // Check if we should retry
        if (job.attempts < job.maxAttempts) {
          job.status = 'retrying';
          job.nextRetryAt = Date.now() + this.calculateRetryDelay(job.attempts);
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
            batch.completedAt = Date.now();
          }
        }

        results.push({ jobId, status: 'failed', error: error instanceof Error ? error.message : String(error), attempts: job.attempts });
      }
    }

    // Update throughput metrics
    const processingTime = Date.now() - startTime;
    this.processedJobsCount += results.length;
    this.lastProcessedTime = Date.now();

    this.updateStats();
    await this.saveState(); // Persist state after processing jobs

    return new Response(JSON.stringify({
      processedJobs: results.length,
      processingTime,
      results,
      queueStats: {
        pendingJobs: this.getTotalPendingJobs(),
        retryQueueSize: this.retryQueue.length,
        deadLetterQueueSize: this.deadLetterQueue.length
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
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

  private async handleHealthCheck(): Promise<Response> {
    const health = {
      status: 'healthy',
      timestamp: Date.now(),
      stats: this.stats,
      queueLengths: {
        processing: this.processingQueue.length,
        retry: this.retryQueue.length,
        deadLetter: this.deadLetterQueue.length
      }
    };

    return new Response(JSON.stringify(health), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async processJob(job: QueueJob): Promise<BatchLookupResponse> {
    // This is a placeholder - in reality, this would call the actual lookup logic
    // For now, we'll simulate processing time and return a mock result
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 100));
    
    return {
      id: job.request.id,
      query: job.request.query,
      point: { lon: -75.6972, lat: 45.4215 },
      properties: { FED_NUM: "35047", FED_NAME: "Ottawa Centre" },
      processingTime: Date.now() - job.startedAt!
    };
  }

  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    return Math.min(1000 * Math.pow(2, attempt - 1), 30000);
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
    let oldestPendingJob = Date.now();

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
    const timeSinceLastProcessed = Math.max(Date.now() - this.lastProcessedTime, 1000);
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
      oldestPendingJob: oldestPendingJob === Date.now() ? 0 : Date.now() - oldestPendingJob,
      deadLetterQueueSize: this.deadLetterQueue.length,
      retryQueueSize: this.retryQueue.length
    };
  }

  private async handleDeadLetterQueue(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const deadLetterJobs = this.deadLetterQueue
      .slice(offset, offset + limit)
      .map(jobId => {
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
          request: job.request
        };
      })
      .filter(Boolean);

    return new Response(JSON.stringify({
      deadLetterJobs,
      total: this.deadLetterQueue.length,
      limit,
      offset
    }), {
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
    await this.saveState(); // Persist state after retrying dead letter jobs

    return new Response(JSON.stringify({
      message: `Retried ${retriedCount} dead letter jobs`,
      retriedCount,
      results
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export { QueueManager as QueueManagerDO };
