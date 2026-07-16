import { describe, it, expect } from 'vitest';
import type { Env } from '../src/types';
import { createLookupTestEnv, fetchLookup } from './helpers/lookup-test-env';

/**
 * Worker-level coverage for the fail-closed auth, CORS-credentials, and geocode
 * rate-limiting fixes. Unit-level behaviour lives in utils.test.ts / http-headers.test.ts;
 * these tests pin the routing wiring in src/worker.ts.
 */

describe('admin routes fail closed', () => {
  it('401s /metrics when BASIC_AUTH is unset', async () => {
    const response = await fetchLookup(createLookupTestEnv(), '/metrics');
    expect(response.status).toBe(401);
  });

  it('401s /metrics with credentials when BASIC_AUTH is unset', async () => {
    const response = await fetchLookup(createLookupTestEnv(), '/metrics', {
      headers: { Authorization: `Basic ${btoa('admin:secret')}` },
    });
    expect(response.status).toBe(401);
  });

  it('200s /metrics with matching credentials when BASIC_AUTH is set', async () => {
    const env = { ...createLookupTestEnv(), BASIC_AUTH: 'admin:secret' } as Env;
    const response = await fetchLookup(env, '/metrics', {
      headers: { Authorization: `Basic ${btoa('admin:secret')}` },
    });
    expect(response.status).toBe(200);
  });

  it('serves only public liveness on /health when BASIC_AUTH is unset', async () => {
    const response = await fetchLookup(createLookupTestEnv(), '/health');
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe('healthy');
    // Detailed diagnostics (metrics, circuit breakers, datasets) require admin auth.
    expect(body.metrics).toBeUndefined();
    expect(body.datasets).toBeUndefined();
  });
});

describe('CORS credentials', () => {
  it('preflight returns wildcard without credentials when ALLOWED_ORIGINS is unset', async () => {
    const response = await fetchLookup(createLookupTestEnv(), '/api/federal', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('preflight grants credentials only to an allowlisted origin', async () => {
    const env = {
      ...createLookupTestEnv(),
      ALLOWED_ORIGINS: 'https://portal.example',
    } as Env;

    const allowed = await fetchLookup(env, '/api/federal', {
      method: 'OPTIONS',
      headers: { Origin: 'https://portal.example' },
    });
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://portal.example');
    expect(allowed.headers.get('Access-Control-Allow-Credentials')).toBe('true');

    const denied = await fetchLookup(env, '/api/federal', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    });
    // First configured origin is a browser no-op for the caller — and never with credentials.
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBe('https://portal.example');
    expect(denied.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
});

describe('geocode routes are rate limited', () => {
  // The rate-limit store is module-global; a unique client IP per test isolates buckets.
  const routes: Array<{ path: string; ip: string }> = [
    { path: '/api/geocode?q=100 Main St Toronto', ip: '198.51.100.10' },
    { path: '/api/reverse?lat=43.6&lon=-79.4', ip: '198.51.100.11' },
    { path: '/api/normalize-address?q=100 Main St', ip: '198.51.100.12' },
  ];

  for (const { path, ip } of routes) {
    it(`429s ${path.split('?')[0]} past the limit`, async () => {
      const env = { ...createLookupTestEnv(), RATE_LIMIT: 1 } as Env;
      const first = await fetchLookup(env, path, {
        headers: { 'CF-Connecting-IP': ip },
      });
      expect(first.status).not.toBe(429);

      const second = await fetchLookup(env, path, {
        headers: { 'CF-Connecting-IP': ip },
      });
      expect(second.status).toBe(429);
      const body = (await second.json()) as { code?: string };
      expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  }
});
