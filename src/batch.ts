import { Env, BatchLookupRequest, BatchLookupResponse, BatchJob } from './types';
import { normalizeAddressWithGoogle, type GeocodeBatchResult } from './geocoding';
import { incrementMetric, recordTiming } from './metrics';
import { generateLookupCacheKey, getCachedLookupResult, setCachedLookupResult } from './cache';
import { pickDataset, provincePathFromFederalProperties } from './utils';

const FEDERAL_PATH = '/api/federal';

// Default batch size
const DEFAULT_BATCH_SIZE = 10;

// Maximum batch size limits
export const MAX_BATCH_SIZE = 100;
export const MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024; // 10MB

// Process batch lookup with individual geocoding
export async function processBatchLookup(
  env: Env, 
  requests: BatchLookupRequest[],
  geocodeIfNeeded: (env: Env, query: any, request?: Request) => Promise<{ lon: number; lat: number }>,
  lookupRiding: (env: Env, pathname: string, lon: number, lat: number) => Promise<any>
): Promise<BatchLookupResponse[]> {
  // Validate batch size
  if (requests.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE} requests`);
  }
  
  const results: BatchLookupResponse[] = [];
  // Validate and clamp batch size from environment
  const rawBatchSize = env.BATCH_SIZE || DEFAULT_BATCH_SIZE;
  const batchSize = Math.max(1, Math.min(Math.floor(rawBatchSize), MAX_BATCH_SIZE));
  
  incrementMetric('batchRequests');
  const startTime = Date.now();
  
  try {
    // Process requests in chunks to avoid overwhelming the system
    for (let i = 0; i < requests.length; i += batchSize) {
      const chunk = requests.slice(i, i + batchSize);
      const chunkPromises = chunk.map(async (req) => {
        const startTime = Date.now();
        try {
          const { lon, lat } = await geocodeIfNeeded(env, req.query);
          const result = await lookupRiding(env, req.pathname, lon, lat);
          const processingTime = Date.now() - startTime;
          
          return {
            id: req.id,
            query: req.query,
            point: { lon, lat },
            properties: result.properties,
            processingTime
          } as BatchLookupResponse;
        } catch (error) {
          const processingTime = Date.now() - startTime;
          return {
            id: req.id,
            query: req.query,
            properties: null,
            error: error instanceof Error ? error.message : "Unknown error",
            processingTime
          } as BatchLookupResponse;
        }
      });
      
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }
    
    recordTiming('totalBatchTime', Date.now() - startTime);
    return results;
  } catch (error) {
    incrementMetric('batchErrors');
    recordTiming('totalBatchTime', Date.now() - startTime);
    throw error;
  }
}

// Process batch lookup with batch geocoding (GeoGratis-first). Optional normalization via Google when key configured.
export async function processBatchLookupWithBatchGeocoding(
  env: Env,
  requests: BatchLookupRequest[],
  geocodeIfNeeded: (env: Env, query: any, request?: Request) => Promise<{ lon: number; lat: number; normalizedAddress?: string; addressComponents?: import('./types').GoogleAddressComponents }>,
  lookupRiding: (env: Env, pathname: string, lon: number, lat: number) => Promise<any>,
  geocodeBatchFn: (env: Env, queries: any[], request?: Request, circuitBreaker?: { execute: (key: string, fn: () => Promise<any>) => Promise<any> }) => Promise<GeocodeBatchResult[]>,
  request?: Request,
  circuitBreaker?: { execute: (key: string, fn: () => Promise<any>) => Promise<any> }
): Promise<BatchLookupResponse[]> {
  // Validate batch size
  if (requests.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE} requests`);
  }
  
  const results: BatchLookupResponse[] = [];
  
  incrementMetric('batchRequests');
  const startTime = Date.now();
  
  try {
    // Group requests by geocoding needs
    const geocodingNeeded: Array<{ request: BatchLookupRequest; index: number }> = [];
    const coordinatesProvided: Array<{ request: BatchLookupRequest; index: number; lon: number; lat: number }> = [];
    
    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      if (req.query.lat !== undefined && req.query.lon !== undefined) {
        coordinatesProvided.push({
          request: req,
          index: i,
          lon: req.query.lon,
          lat: req.query.lat
        });
      } else {
        geocodingNeeded.push({
          request: req,
          index: i
        });
      }
    }
    
    const hasGoogleKey = () => !!(request?.headers?.get?.('X-Google-API-Key') ?? env.GOOGLE_MAPS_KEY);
    const resolveNormalized = async (lat: number, lon: number): Promise<{ formattedAddress?: string; components?: import('./types').GoogleAddressComponents } | undefined> => {
      if (!hasGoogleKey()) return undefined;
      const v = await normalizeAddressWithGoogle(env, lat, lon, request, circuitBreaker);
      return v ?? undefined;
    };

    const runCombined = async (
      batchReq: BatchLookupRequest,
      lon: number,
      lat: number
    ): Promise<Pick<BatchLookupResponse, 'point' | 'properties' | 'riding' | 'province_data' | 'normalizedAddress' | 'addressComponents'>> => {
      const cacheQueryFed = { ...batchReq.query, lon, lat };
      const federalCacheKey = generateLookupCacheKey(cacheQueryFed, FEDERAL_PATH);
      const federalCached = await getCachedLookupResult(env, federalCacheKey);
      let normalizedAddress: string | undefined = federalCached?.normalizedAddress;
      let addressComponents = federalCached?.addressComponents;
      if (hasGoogleKey()) {
        const googleResult = await resolveNormalized(lat, lon);
        if (googleResult) {
          normalizedAddress = googleResult.formattedAddress;
          addressComponents = googleResult.components;
        }
      }

      let properties: Record<string, unknown> | null;
      let riding: string | undefined;
      if (federalCached) {
        properties = federalCached.properties as Record<string, unknown> | null;
        riding = federalCached.riding;
      } else {
        const fed = await lookupRiding(env, FEDERAL_PATH, lon, lat);
        properties = fed.properties as Record<string, unknown> | null;
        riding = fed.riding;
        const { r2Key } = pickDataset(FEDERAL_PATH);
        const dataset = r2Key.replace('.geojson', '');
        const toCache = {
          properties: fed.properties,
          riding: fed.riding,
          ...(normalizedAddress && { normalizedAddress }),
          ...(addressComponents && { addressComponents }),
        };
        await setCachedLookupResult(env, federalCacheKey, toCache, dataset, { lon, lat });
      }

      const provincePath = provincePathFromFederalProperties(properties);
      let province_data: { riding: string; properties: Record<string, unknown>; dataset: string } | null = null;
      if (provincePath) {
        const provinceCacheKey = generateLookupCacheKey(cacheQueryFed, provincePath);
        const cachedProv = await getCachedLookupResult(env, provinceCacheKey);
        if (cachedProv) {
          province_data = {
            riding: cachedProv.riding ?? '',
            properties: (cachedProv.properties || {}) as Record<string, unknown>,
            dataset: pickDataset(provincePath).r2Key.replace('.geojson', ''),
          };
        } else {
          try {
            const provLookup = await lookupRiding(env, provincePath, lon, lat);
            const { r2Key } = pickDataset(provincePath);
            const dataset = r2Key.replace('.geojson', '');
            const toCache = { properties: provLookup.properties, riding: provLookup.riding };
            await setCachedLookupResult(env, provinceCacheKey, toCache, dataset, { lon, lat });
            province_data = {
              riding: provLookup.riding ?? '',
              properties: (provLookup.properties || {}) as Record<string, unknown>,
              dataset,
            };
          } catch {
            province_data = null;
          }
        }
      }

      return {
        point: { lon, lat },
        properties,
        riding,
        province_data,
        ...(normalizedAddress && { normalizedAddress }),
        ...(addressComponents && { addressComponents }),
      };
    };

    // Process coordinates-provided requests immediately
    for (const { request, index, lon, lat } of coordinatesProvided) {
      const startTime = Date.now();
      try {
        if (request.pathname === '/api/combined') {
          const payload = await runCombined(request, lon, lat);
          results[index] = {
            id: request.id,
            query: request.query,
            ...payload,
            processingTime: Date.now() - startTime,
          };
          continue;
        }

        const cacheKey = generateLookupCacheKey({ ...request.query, lon, lat }, request.pathname);
        const cachedResult = await getCachedLookupResult(env, cacheKey);
        let normalizedAddress: string | undefined = cachedResult?.normalizedAddress;
        let addressComponents = cachedResult?.addressComponents;

        if (cachedResult) {
          // Always try to get normalized address via reverse geocoding when Google API key is available
          if (hasGoogleKey()) {
            const googleResult = await resolveNormalized(lat, lon);
            if (googleResult) {
              normalizedAddress = googleResult.formattedAddress;
              addressComponents = googleResult.components;
            }
          }
          const processingTime = Date.now() - startTime;
          results[index] = {
            id: request.id,
            query: request.query,
            point: { lon, lat },
            properties: cachedResult.properties,
            ...(normalizedAddress && { normalizedAddress }),
            ...(addressComponents && { addressComponents }),
            processingTime
          };
        } else {
          const result = await lookupRiding(env, request.pathname, lon, lat);
          if (hasGoogleKey()) {
            const googleResult = await resolveNormalized(lat, lon);
            if (googleResult) {
              normalizedAddress = googleResult.formattedAddress;
              addressComponents = googleResult.components;
            }
          }
          const processingTime = Date.now() - startTime;
          const { r2Key } = pickDataset(request.pathname);
          const dataset = r2Key.replace('.geojson', '');
          const toCache = { 
            ...result, 
            ...(normalizedAddress && { normalizedAddress }),
            ...(addressComponents && { addressComponents })
          };
          await setCachedLookupResult(env, cacheKey, toCache, dataset, { lon, lat });
          results[index] = {
            id: request.id,
            query: request.query,
            point: { lon, lat },
            properties: result.properties,
            ...(normalizedAddress && { normalizedAddress }),
            ...(addressComponents && { addressComponents }),
            processingTime
          };
        }
      } catch (error) {
        const processingTime = Date.now() - startTime;
        results[index] = {
          id: request.id,
          query: request.query,
          properties: null,
          error: error instanceof Error ? error.message : "Lookup failed",
          processingTime
        };
      }
    }
    
    // Process geocoding-needed requests in batches (GeoGratis-first via geocodeBatchFn)
    if (geocodingNeeded.length > 0) {
      const queries = geocodingNeeded.map(item => item.request.query);
      const geocodingResults = await geocodeBatchFn(env, queries, request, circuitBreaker);
      
      for (let i = 0; i < geocodingNeeded.length; i++) {
        const { request, index } = geocodingNeeded[i];
        const geocodingResult = geocodingResults[i];
        const startTime = Date.now();
        
        if (geocodingResult.success) {
          try {
            if (request.pathname === '/api/combined') {
              const payload = await runCombined(
                request,
                geocodingResult.lon,
                geocodingResult.lat
              );
              results[index] = {
                id: request.id,
                query: request.query,
                ...payload,
                processingTime: Date.now() - startTime,
              };
              continue;
            }

            const cacheKey = generateLookupCacheKey(
              { ...request.query, lon: geocodingResult.lon, lat: geocodingResult.lat },
              request.pathname
            );
            const cachedResult = await getCachedLookupResult(env, cacheKey);
            let normalizedAddress: string | undefined = geocodingResult.normalizedAddress ?? cachedResult?.normalizedAddress;
            let addressComponents = geocodingResult.addressComponents ?? cachedResult?.addressComponents;
            // Always try to get normalized address via reverse geocoding when Google API key is available
            if (hasGoogleKey()) {
              const googleResult = await resolveNormalized(geocodingResult.lat, geocodingResult.lon);
              if (googleResult) {
                normalizedAddress = googleResult.formattedAddress;
                addressComponents = googleResult.components;
              }
            }
            
            if (cachedResult) {
              const processingTime = Date.now() - startTime;
              results[index] = {
                id: request.id,
                query: request.query,
                point: { lon: geocodingResult.lon, lat: geocodingResult.lat },
                properties: cachedResult.properties,
                ...(normalizedAddress && { normalizedAddress }),
                ...(addressComponents && { addressComponents }),
                processingTime
              };
            } else {
              const result = await lookupRiding(env, request.pathname, geocodingResult.lon, geocodingResult.lat);
              const processingTime = Date.now() - startTime;
              const { r2Key } = pickDataset(request.pathname);
              const dataset = r2Key.replace('.geojson', '');
              const toCache = { 
                ...result, 
                ...(normalizedAddress && { normalizedAddress }),
                ...(addressComponents && { addressComponents })
              };
              await setCachedLookupResult(env, cacheKey, toCache, dataset, { lon: geocodingResult.lon, lat: geocodingResult.lat });
              results[index] = {
                id: request.id,
                query: request.query,
                point: { lon: geocodingResult.lon, lat: geocodingResult.lat },
                properties: result.properties,
                ...(normalizedAddress && { normalizedAddress }),
                ...(addressComponents && { addressComponents }),
                processingTime
              };
            }
          } catch (error) {
            const processingTime = Date.now() - startTime;
            results[index] = {
              id: request.id,
              query: request.query,
              properties: null,
              error: error instanceof Error ? error.message : "Lookup failed",
              processingTime
            };
          }
        } else {
          const processingTime = Date.now() - startTime;
          results[index] = {
            id: request.id,
            query: request.query,
            properties: null,
            error: geocodingResult.error || "Geocoding failed",
            processingTime
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
export async function submitBatchToQueue(env: Env, requests: BatchLookupRequest[]): Promise<{ batchId: string; status: string }> {
  // Validate batch size
  if (requests.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE} requests`);
  }
  
  if (!env.QUEUE_MANAGER) {
    throw new Error("Queue manager not configured");
  }

  const queueManagerId = env.QUEUE_MANAGER.idFromName("main-queue");
  const queueManager = env.QUEUE_MANAGER.get(queueManagerId);
  
  const response = await queueManager.fetch(new Request("https://queue.local/queue/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests })
  }));

  if (!response.ok) {
    const error = await response.json() as { error?: string };
    throw new Error(error.error || "Failed to submit batch to queue");
  }

  return await response.json();
}

export async function getBatchStatus(env: Env, batchId: string): Promise<any> {
  if (!env.QUEUE_MANAGER) {
    throw new Error("Queue manager not configured");
  }

  const queueManagerId = env.QUEUE_MANAGER.idFromName("main-queue");
  const queueManager = env.QUEUE_MANAGER.get(queueManagerId);
  
  const response = await queueManager.fetch(new Request(`https://queue.local/queue/status?batchId=${batchId}`));
  
  if (!response.ok) {
    const error = await response.json() as { error?: string };
    throw new Error(error.error || "Failed to get batch status");
  }

  return await response.json();
}

export async function processQueueJobs(env: Env, maxJobs: number = 10): Promise<any> {
  if (!env.QUEUE_MANAGER) {
    throw new Error("Queue manager not configured");
  }

  const queueManagerId = env.QUEUE_MANAGER.idFromName("main-queue");
  const queueManager = env.QUEUE_MANAGER.get(queueManagerId);
  
  const response = await queueManager.fetch(new Request("https://queue.local/queue/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maxJobs })
  }));
  
  if (!response.ok) {
    const error = await response.json() as { error?: string };
    throw new Error(error.error || "Failed to process queue jobs");
  }

  return await response.json();
}

// Batch job management
export function createBatchJob(requests: BatchLookupRequest[]): BatchJob {
  return {
    id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    requests,
    status: 'pending',
    createdAt: Date.now(),
    results: [],
    errors: []
  };
}

export function updateBatchJobStatus(job: BatchJob, status: BatchJob['status'], results?: BatchLookupResponse[], errors?: string[]): BatchJob {
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

// Batch processing configuration
export const BATCH_CONFIG = {
  DEFAULT_BATCH_SIZE: 10,
  MAX_BATCH_SIZE: 100,
  TIMEOUT: 300000, // 5 minutes
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000 // 1 second
};
