import { describe, it, expect, beforeEach } from 'vitest';
import { handleLookupRequest } from '../src/lookup-handler';
import { createRouteContext, type RouteContext, type RouteDeps } from '../src/route-context';
import { getMetrics, resetMetrics } from '../src/metrics';
import { TimeoutError } from '../src/retry';
import { serviceUnavailableResponse } from '../src/utils';
import type { Env } from '../src/types';

/**
 * A stage timeout is transient, not a failure — and the status is the point.
 *
 * A stage timeout is terminal for every lookup shape — an ODA stage timeout is a rethrow rather than
 * a fall-through, and `walkProviderChain` rethrows anything that is not a `NoResultsError` — so a
 * cold isolate whose first ODA query exceeds the stage budget used to reach the caller as a 500
 * LOOKUP_ERROR: an internal error, for a request that would have succeeded a second later. It is now
 * a 503 carrying `Retry-After`.
 *
 * 500 tells a caller to stop and an operator to page. 503 tells both the truth. The distinction only
 * means something if the 500 case still happens, so that is tested too.
 */

const nullKv = () =>
  ({
    get: async () => null,
    put: async () => {},
    delete: async () => {},
  }) as unknown as KVNamespace;

function makeContext(env: Env, request: Request, lookup?: RouteDeps['lookup']): RouteContext {
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

const env = () => ({ LOOKUP_CACHE: nullKv() }) as unknown as Env;
const federal = () => new Request('https://x.test/api/federal?lat=45&lon=-75');

beforeEach(() => {
  resetMetrics();
});

describe('a stage timeout reaches the caller as transient', () => {
  it('answers with 503 LOOKUP_TIMEOUT, not 500 LOOKUP_ERROR', async () => {
    const response = await handleLookupRequest(
      makeContext(env(), federal(), async () => {
        throw new TimeoutError('ODA geocoding', 3000);
      })
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as { code: string; correlationId: string };
    expect(body.code).toBe('LOOKUP_TIMEOUT');
    // The correlation ID still comes back, so the log line can be found from the response.
    expect(body.correlationId).toBe('corr');
  });

  it('says how long to wait, so the caller can act on it', async () => {
    const response = await handleLookupRequest(
      makeContext(env(), federal(), async () => {
        throw new TimeoutError('Geocoding', 30000);
      })
    );

    expect(response.headers.get('Retry-After')).toBe('5');
  });

  it('counts the failure and the transient subset separately', async () => {
    await handleLookupRequest(
      makeContext(env(), federal(), async () => {
        throw new TimeoutError('Geocoding', 30000);
      })
    );

    // `lookupErrors` was declared and surfaced on /metrics but never written. Both counters matter:
    // one is "how often do lookups fail", the other "how much of that is transient".
    expect(getMetrics().lookupErrors).toBe(1);
    expect(getMetrics().lookupTimeouts).toBe(1);
  });

  it('still reports a genuine failure as 500 LOOKUP_ERROR — the distinction has to hold', async () => {
    const response = await handleLookupRequest(
      makeContext(env(), federal(), async () => {
        throw new Error('R2 is down');
      })
    );

    expect(response.status).toBe(500);
    expect(((await response.json()) as { code: string }).code).toBe('LOOKUP_ERROR');
    expect(getMetrics().lookupErrors).toBe(1);
    // Counted as a failure, not as transient — this is the number that should page.
    expect(getMetrics().lookupTimeouts).toBe(0);
  });

  it('keeps the body generic — no internal message reaches the client', async () => {
    const response = await handleLookupRequest(
      makeContext(env(), federal(), async () => {
        throw new Error('R2 bucket riding-and-address-prod is down');
      })
    );

    expect(JSON.stringify(await response.json())).not.toContain('riding-and-address-prod');
  });
});

describe('serviceUnavailableResponse', () => {
  it('carries the code, the correlation ID and a retry hint', async () => {
    const response = serviceUnavailableResponse('LOOKUP_TIMEOUT', 'try again', 'corr', 12);

    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('12');
    expect(await response.json()).toMatchObject({
      code: 'LOOKUP_TIMEOUT',
      error: 'try again',
      correlationId: 'corr',
    });
  });

  it('defaults the retry hint rather than leaving the header off', () => {
    expect(serviceUnavailableResponse('X', 'y').headers.get('Retry-After')).toBe('5');
  });
});
