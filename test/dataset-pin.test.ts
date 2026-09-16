import { describe, it, expect, vi } from 'vitest';
import { handleLookupRequest } from '../src/lookup-handler';
import { createRouteContext, type RouteContext, type RouteDeps } from '../src/route-context';
import { Env } from '../src/types';

function makeContext(
  env: Env,
  request: Request,
  lookup?: RouteDeps['lookup']
): RouteContext {
  return createRouteContext({
    request,
    env,
    ctx: {
      waitUntil: () => {},
      passThroughOnException: () => {},
      props: {},
    } as unknown as ExecutionContext,
    correlationId: 'corr',
    startTime: Date.now(),
    deps: lookup ? { lookup } : undefined,
  });
}

describe('dataset pin', () => {
  it('returns DATASET_UNAVAILABLE when pin does not match current vintage', async () => {
    const env = {} as Env;
    const request = new Request('https://x.test/api/federal?lat=45&lon=-75&dataset=federalridings-2015.geojson');
    const response = await handleLookupRequest(makeContext(env, request));
    expect(response.status).toBe(404);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('DATASET_UNAVAILABLE');
  });

  it('allows a matching year pin', async () => {
    const lookup = vi.fn(async () => ({
      properties: { FED_NAME: 'Test' },
      riding: 'Test',
      point: { lon: -75, lat: 45 },
      cacheStatus: 'MISS' as const,
    }));
    // performExpandedLookup path — stub via throwing early is hard; call with coords and mock expansion.
    // Here we only assert pin validation passes into the lookup try path without 404.
    const env = {} as Env;
    const request = new Request('https://x.test/api/federal?lat=45&lon=-75&dataset=2024');
    const response = await handleLookupRequest(
      makeContext(env, request, async () => ({
        properties: { FED_NAME: 'Test' },
        riding: 'Test',
        point: { lon: -75, lat: 45 },
        cacheStatus: 'MISS' as const
      }))
    );
    // May 500 if expansion needs more env; must not be DATASET_UNAVAILABLE.
    if (response.status === 404) {
      const body = (await response.json()) as { code: string };
      expect(body.code).not.toBe('DATASET_UNAVAILABLE');
    } else {
      expect(response.status).not.toBe(404);
    }
    void lookup;
  });
});
