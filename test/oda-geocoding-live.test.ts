import { describe, it, expect } from 'vitest';
import type { QueryParams } from '../src/types';

const runLive = process.env.ODA_LIVE === '1';
const baseUrl = (process.env.ODA_LIVE_BASE_URL ?? 'https://riding-lookup.chester-hill-solutions.workers.dev').replace(
  /\/$/,
  ''
);
const basicAuth = process.env.ODA_LIVE_BASIC_AUTH ?? process.env.BENCHMARK_BASIC_AUTH;

type LiveCase = {
  name: string;
  path: string;
  expectStatus: number;
  expectCode?: string;
  expectMethod?: string;
  latClose?: number;
  lonClose?: number;
};

function authHeaders(): Record<string, string> {
  if (!basicAuth) return {};
  return { Authorization: `Basic ${Buffer.from(basicAuth).toString('base64')}` };
}

function queryString(params: QueryParams): string {
  const q = new URLSearchParams();
  if (params.address) q.set('address', params.address);
  if (params.postal) q.set('postal', params.postal);
  if (params.city) q.set('city', params.city);
  if (params.state) q.set('province', params.state);
  return q.toString();
}

const LIVE_CASES: LiveCase[] = [
  {
    name: '123 Main St Toronto exact',
    path: `/api/geocode?${queryString({ address: '123 Main St', city: 'Toronto', state: 'ON' })}`,
    expectStatus: 200,
    expectMethod: 'exact',
    latClose: 43.6532,
    lonClose: -79.3832,
  },
  {
    name: '757 Victoria Park Toronto',
    path: `/api/geocode?${queryString({ address: '757 Victoria Park', city: 'Toronto', state: 'ON' })}`,
    expectStatus: 200,
    latClose: 43.692101,
    lonClose: -79.288688,
  },
  {
    name: 'postal M5V2T6',
    path: '/api/geocode?postal=M5V2T6&province=ON',
    expectStatus: 200,
    expectMethod: 'postal_centroid',
  },
  {
    name: 'Montreal Saint-Paul',
    path: `/api/geocode?${queryString({ address: '350 Saint-Paul RUE E', city: 'Montréal', state: 'QC' })}`,
    expectStatus: 200,
    expectMethod: 'exact',
  },
  {
    name: 'BC not loaded',
    path: '/api/geocode?postal=V6B1A1&province=BC',
    expectStatus: 404,
    expectCode: 'PROVINCE_NOT_LOADED',
  },
  {
    name: 'ambiguous street only',
    path: '/api/geocode?address=Main%20Street',
    expectStatus: 422,
    expectCode: 'AMBIGUOUS_LOCATION',
  },
];

describe.skipIf(!runLive)('ODA live geocoding (ODA_LIVE=1)', () => {
  for (const testCase of LIVE_CASES) {
    it(testCase.name, async () => {
      if (!basicAuth) {
        throw new Error('Set ODA_LIVE_BASIC_AUTH or BENCHMARK_BASIC_AUTH for live ODA tests');
      }

      const response = await fetch(`${baseUrl}${testCase.path}`, { headers: authHeaders() });
      expect(response.status).toBe(testCase.expectStatus);

      const body = (await response.json()) as {
        code?: string;
        geocodeMethod?: string;
        point?: { lat: number; lon: number };
      };

      if (testCase.expectCode) expect(body.code).toBe(testCase.expectCode);
      if (testCase.expectMethod) expect(body.geocodeMethod).toBe(testCase.expectMethod);
      if (testCase.latClose !== undefined) expect(body.point?.lat).toBeCloseTo(testCase.latClose, 3);
      if (testCase.lonClose !== undefined) expect(body.point?.lon).toBeCloseTo(testCase.lonClose, 3);
    });
  }
});

describe('ODA live placeholder', () => {
  it('skips live tests unless ODA_LIVE=1', () => {
    expect(true).toBe(true);
  });
});
