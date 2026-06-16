import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { geocodeIfNeeded } from '../src/geocoding';
import { createCircuitBreaker } from '../src/circuit-breaker';
import { createOdaFixtureEnv } from './helpers/oda-memory-db';
import { SUPPORTED_ODA_PROVINCES } from '../src/oda-import';
import type { Env, QueryParams } from '../src/types';

type ComparisonCase = {
  id: string;
  category: string;
  label: string;
  query: QueryParams & { province?: string };
};

const casesPath = join(process.cwd(), 'test/fixtures/comparison/opennorth-cases.json');
const allCases = JSON.parse(readFileSync(casesPath, 'utf-8')) as ComparisonCase[];
const addressCases = allCases.filter((c) => c.category === 'B' || c.category === 'G');

const { d1: fixtureD1 } = createOdaFixtureEnv();

function odaEnv(): Env {
  return {
    RIDINGS: {} as R2Bucket,
    ODA_DB: fixtureD1,
    ODA_GEOCODING_ENABLED: 'true',
    ODA_PROVINCES: SUPPORTED_ODA_PROVINCES.join(','),
    ODA_MIN_CONFIDENCE: '0.6',
    GEOCODING_CACHE: {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
    } as KVNamespace,
  };
}

const circuitBreaker = createCircuitBreaker(3, 30000, 2);

describe('ODA comparison address cases (offline, categories B and G)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      if (String(url).includes('geolocator.api.geo.ca') || String(url).includes('geogratis')) {
        return new Response(
          JSON.stringify([
            {
              geometry: { type: 'Point', coordinates: [-79.38, 43.65] },
              qualifier: 'GEOMETRIC_CENTER',
              score: 0.9,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected fetch: ${String(url)}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  for (const testCase of addressCases) {
    it(`${testCase.id}: ${testCase.label}`, async () => {
      const qp: QueryParams = {
        address: testCase.query.address,
        postal: testCase.query.postal,
        city: testCase.query.city,
        state: testCase.query.province ?? testCase.query.state,
      };

      if (!qp.address && !qp.postal) {
        return;
      }

      try {
        await geocodeIfNeeded(odaEnv(), qp, undefined, undefined, {
          execute: (key, fn, options) => circuitBreaker.execute(key, fn, options),
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Circuit breaker is OPEN')) {
          throw error;
        }
      }
    });
  }
});
