import { describe, it, expect } from 'vitest';
import {
  createBatchJob,
  updateBatchJobStatus,
  MAX_BATCH_SIZE,
  MAX_REQUEST_BODY_SIZE,
  BATCH_CONFIG
} from '../src/batch';
import type { BatchLookupRequest } from '../src/types';

describe('createBatchJob', () => {
  it('creates a job with pending status', () => {
    const requests: BatchLookupRequest[] = [
      { id: '1', query: { address: 'Ottawa' }, pathname: '/api/federal' }
    ];
    const job = createBatchJob(requests);
    expect(job.status).toBe('pending');
    expect(job.requests).toEqual(requests);
    expect(job.results).toEqual([]);
    expect(job.errors).toEqual([]);
  });

  it('generates a unique id', () => {
    const requests: BatchLookupRequest[] = [
      { id: '1', query: { address: 'Ottawa' }, pathname: '/api/federal' }
    ];
    const job1 = createBatchJob(requests);
    const job2 = createBatchJob(requests);
    expect(job1.id).not.toBe(job2.id);
    expect(job1.id).toMatch(/^batch_\d+_[a-z0-9]+$/);
  });

  it('sets createdAt to current timestamp', () => {
    const before = Date.now();
    const job = createBatchJob([]);
    const after = Date.now();
    expect(job.createdAt).toBeGreaterThanOrEqual(before);
    expect(job.createdAt).toBeLessThanOrEqual(after);
  });
});

describe('updateBatchJobStatus', () => {
  it('updates status to completed', () => {
    const job = createBatchJob([]);
    const updated = updateBatchJobStatus(job, 'completed');
    expect(updated.status).toBe('completed');
    expect(updated.completedAt).toBeDefined();
  });

  it('updates status to failed', () => {
    const job = createBatchJob([]);
    const updated = updateBatchJobStatus(job, 'failed');
    expect(updated.status).toBe('failed');
    expect(updated.completedAt).toBeDefined();
  });

  it('does not set completedAt for pending', () => {
    const job = createBatchJob([]);
    const updated = updateBatchJobStatus(job, 'pending');
    expect(updated.completedAt).toBeUndefined();
  });

  it('adds results when provided', () => {
    const job = createBatchJob([]);
    const results = [
      { id: '1', query: { address: 'Ottawa' }, properties: {}, processingTime: 100 }
    ];
    const updated = updateBatchJobStatus(job, 'completed', results);
    expect(updated.results).toEqual(results);
  });

  it('adds errors when provided', () => {
    const job = createBatchJob([]);
    const errors = ['Error 1', 'Error 2'];
    const updated = updateBatchJobStatus(job, 'failed', undefined, errors);
    expect(updated.errors).toEqual(errors);
  });

  it('does not mutate original job', () => {
    const job = createBatchJob([]);
    const originalStatus = job.status;
    updateBatchJobStatus(job, 'completed');
    expect(job.status).toBe(originalStatus);
  });
});

describe('MAX_BATCH_SIZE', () => {
  it('is set to 100', () => {
    expect(MAX_BATCH_SIZE).toBe(100);
  });
});

describe('MAX_REQUEST_BODY_SIZE', () => {
  it('is set to 10MB', () => {
    expect(MAX_REQUEST_BODY_SIZE).toBe(10 * 1024 * 1024);
  });
});

describe('BATCH_CONFIG', () => {
  it('has correct default values', () => {
    expect(BATCH_CONFIG.DEFAULT_BATCH_SIZE).toBe(10);
    expect(BATCH_CONFIG.MAX_BATCH_SIZE).toBe(100);
    expect(BATCH_CONFIG.TIMEOUT).toBe(300000);
    expect(BATCH_CONFIG.RETRY_ATTEMPTS).toBe(3);
    expect(BATCH_CONFIG.RETRY_DELAY).toBe(1000);
  });
});
