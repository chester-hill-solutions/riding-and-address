import { beforeEach, describe, expect, it } from 'vitest';

import {
  handleBoundariesRoute,
  handleCacheWarm,
  handleDatabaseRoute,
  handleGeocodingBatchStatus,
} from '../src/spatial-handlers';
import { createRouteContext, type RouteContext } from '../src/route-context';
import { createLookupTestEnv } from './helpers/lookup-test-env';
import type { Env } from '../src/types';

/**
 * The spatial database and boundary surfaces, now ported out of the Worker's legacy chain.
 *
 * **The behaviour that is easy to lose is the 404.** Each surface has one catch-all entry, and a
 * path that is not one of the known sub-paths is a 404 with the surface's own wording — not a
 * crash, not a silent success, and not the same 404 as every other surface. It is the answer a
 * caller gets for a typo, so it is worth pinning.
 *
 * The method matters too: a GET to a POST-only sub-path matches the table's catch-all entry,
 * because the method is part of the match — so it gets the catch-all's 404 rather than the
 * sub-path's behaviour. That is what the legacy chain did, and it is what the port does.
 */

let env: Env;

beforeEach(() => {
  env = createLookupTestEnv() as Env;
});

function contextFor(request: Request): RouteContext {
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
  });
}

describe('the spatial database surface', () => {
  it('answers 404 for a sub-path it does not serve', async () => {
    const response = await handleDatabaseRoute(
      contextFor(new Request('https://lookup.test/api/database/nope'))
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe('Database endpoint not found');
  });

  it('answers 404 for a sub-path reached with the wrong method', async () => {
    // `/api/database/init` is POST-only. A GET matches the table's catch-all entry, so the answer
    // is the catch-all's 404 — not the init behaviour, and not a 405.
    const response = await handleDatabaseRoute(
      contextFor(new Request('https://lookup.test/api/database/init'))
    );
    expect(response.status).toBe(404);
  });

  it('refuses a query with no usable coordinates', async () => {
    const response = await handleDatabaseRoute(
      contextFor(new Request('https://lookup.test/api/database/query?lat=not-a-number&lon=1'))
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe('Invalid lat/lon parameters');
  });

  it('reports the database as disabled when it is not enabled', async () => {
    const response = await handleDatabaseRoute(
      contextFor(new Request('https://lookup.test/api/database/stats'))
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { enabled?: boolean; status?: string; features?: number };
    expect(body.enabled).toBe(false);
    expect(body.status).toBe('disabled');
    // Real D1 counts only — no placeholder fields when the database is disabled.
    expect(body.features).toBeUndefined();
  });
});

describe('the boundaries surface', () => {
  it('answers 404 for a sub-path it does not serve', async () => {
    const response = await handleBoundariesRoute(
      contextFor(new Request('https://lookup.test/api/boundaries/nope'))
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe('Boundaries endpoint not found');
  });

  it('refuses a lookup with no usable coordinates', async () => {
    const response = await handleBoundariesRoute(
      contextFor(new Request('https://lookup.test/api/boundaries/lookup?lat=1'))
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe('Invalid lat/lon parameters');
  });

  it('describes what this deployment can serve', async () => {
    const response = await handleBoundariesRoute(
      contextFor(new Request('https://lookup.test/api/boundaries/config'))
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { enabled?: boolean; datasets?: string[] };
    expect(typeof body.enabled).toBe('boolean');
    expect(Array.isArray(body.datasets)).toBe(true);
  });

  it('answers 503 when the spatial database is not enabled', async () => {
    const response = await handleBoundariesRoute(
      contextFor(new Request('https://lookup.test/api/boundaries/all'))
    );
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe('Spatial database not enabled');
  });
});

describe('the geocoding batch status', () => {
  it('describes the surface rather than reporting work in flight', async () => {
    const response = handleGeocodingBatchStatus(
      contextFor(new Request('https://lookup.test/api/geocoding/batch/status'))
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      enabled?: boolean;
      maxBatchSize?: number;
      hasGoogleApiKey?: boolean;
    };
    expect(body.enabled).toBe(true);
    expect(body.maxBatchSize).toBe(10);
    expect(typeof body.hasGoogleApiKey).toBe('boolean');
  });
});

describe('the cache warm surface', () => {
  it('reports how many locations it was given', async () => {
    const response = await handleCacheWarm(
      contextFor(
        new Request('https://lookup.test/api/cache/warm', {
          method: 'POST',
          body: JSON.stringify({ locations: [] }),
        })
      )
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { locations?: number; message?: string };
    expect(body.locations).toBe(0);
    expect(body.message).toBe('Cache warming initiated');
  });
});
