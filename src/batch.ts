import {
  Env,
  BatchLookupRequest,
  BatchLookupResponse,
  BatchJob,
  QueryParams,
  GoogleAddressComponents,
  CircuitBreakerExecutor,
} from './types';
import { parseBatchLookupRequests } from './validation';
import { type GeocodeBatchResult } from './geocoding';
import { incrementMetric, recordTiming } from './metrics';
import {
  performExpandedLookup,
  expandedLookupResponseFields,
  type NormalizedAddressContext,
  type LookupRidingFn,
} from './lookup-expansion';

// Maximum batch size limits
export const MAX_BATCH_SIZE = 100;
export const MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024; // 10MB

// Process batch lookup with batch geocoding (GeoGratis-first). Optional normalization via Google when key configured.
export async function processBatchLookupWithBatchGeocoding(
  env: Env,
  requests: BatchLookupRequest[],
  geocodeIfNeeded: (
    env: Env,
    query: QueryParams,
    request?: Request
  ) => Promise<{
    lon: number;
    lat: number;
    normalizedAddress?: string;
    addressComponents?: GoogleAddressComponents;
  }>,
  lookupRiding: LookupRidingFn,
  geocodeBatchFn: (
    env: Env,
    queries: QueryParams[],
    request?: Request,
    circuitBreaker?: CircuitBreakerExecutor
  ) => Promise<GeocodeBatchResult[]>,
  request?: Request,
  circuitBreaker?: CircuitBreakerExecutor
): Promise<BatchLookupResponse[]> {
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
        'point' | 'properties' | 'riding' | 'province_data' | 'municipality' | 'normalizedAddress' | 'addressComponents'
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
      const geocodingResults = await geocodeBatchFn(env, queries, request, circuitBreaker);

      for (let i = 0; i < geocodingNeeded.length; i++) {
        const { request: batchRequest, index } = geocodingNeeded[i];
        const geocodingResult = geocodingResults[i];
        const itemStart = Date.now();

        if (geocodingResult.success) {
          try {
            const addressContext: NormalizedAddressContext = {
              normalizedAddress: geocodingResult.normalizedAddress,
              addressComponents: geocodingResult.addressComponents,
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

// Queue-based batch processing using Durable Objects
export async function submitBatchToQueue(env: Env, requests: unknown): Promise<{ batchId: string; status: string }> {
  const validatedRequests = parseBatchLookupRequests(requests);

  if (validatedRequests.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE} requests`);
  }

  if (!env.QUEUE_MANAGER) {
    throw new Error('Queue manager not configured');
  }

  const queueManagerId = env.QUEUE_MANAGER.idFromName('main-queue');
  const queueManager = env.QUEUE_MANAGER.get(queueManagerId);

  const response = await queueManager.fetch(
    new Request('https://queue.local/queue/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: validatedRequests }),
    })
  );

  if (!response.ok) {
    const error = (await response.json()) as { error?: string };
    throw new Error(error.error || 'Failed to submit batch to queue');
  }

  return await response.json();
}

export async function getBatchStatus(env: Env, batchId: string): Promise<unknown> {
  if (!env.QUEUE_MANAGER) {
    throw new Error('Queue manager not configured');
  }

  const queueManagerId = env.QUEUE_MANAGER.idFromName('main-queue');
  const queueManager = env.QUEUE_MANAGER.get(queueManagerId);

  const response = await queueManager.fetch(
    new Request(`https://queue.local/queue/status?batchId=${batchId}`)
  );

  if (!response.ok) {
    const error = (await response.json()) as { error?: string };
    throw new Error(error.error || 'Failed to get batch status');
  }

  return await response.json();
}

export async function processQueueJobs(env: Env, maxJobs: number = 10): Promise<unknown> {
  if (!env.QUEUE_MANAGER) {
    throw new Error('Queue manager not configured');
  }

  const queueManagerId = env.QUEUE_MANAGER.idFromName('main-queue');
  const queueManager = env.QUEUE_MANAGER.get(queueManagerId);

  const response = await queueManager.fetch(
    new Request('https://queue.local/queue/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxJobs }),
    })
  );

  if (!response.ok) {
    const error = (await response.json()) as { error?: string };
    throw new Error(error.error || 'Failed to process queue jobs');
  }

  return await response.json();
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

export const BATCH_CONFIG = {
  DEFAULT_BATCH_SIZE: 10,
  MAX_BATCH_SIZE: 100,
  TIMEOUT: 300000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
};
