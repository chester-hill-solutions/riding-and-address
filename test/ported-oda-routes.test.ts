import { describe, expect, it } from 'vitest';

import { handleSuggestRoute } from '../src/oda-handlers';
import { matchRoute, ROUTES } from '../src/routes';
import { createRouteContext } from '../src/route-context';
import { createLookupTestEnv, fetchLookup } from './helpers/lookup-test-env';
import type { Env } from '../src/types';

/**
 * The ODA geocoding and autocomplete routes, now ported out of the Worker's legacy chain.
 *
 * **Two things are asserted here, and the second is the one that matters.**
 *
 * The first: the routes are ported — each carries a real handler, and the legacy branch that
 * used to answer them is gone. The table's rule is that a ported entry's old branch is deleted,
 * not left behind as a second path to the same surface.
 *
 * The second: **the behaviour did not change in the port.** The subtle one is autocomplete: with
 * the suggest index unbuilt, the route used to fall through to the `/api` lookup catch-all, which
 * answers an unregistered lookup path with a 404. So a disabled suggest index answers 404, and it
 * still does — the check moved into the handler rather than being left to an accident of the
 * dispatch order.
 */

function contextFor(env: Env, request: Request) {
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

describe('the ported ODA routes', () => {
  it('each carry a real handler rather than the legacy fallback', () => {
    const ported = ['/api/geocode', '/api/reverse', '/api/normalize-address', '/api/search'];
    for (const path of ported) {
      const entry = ROUTES.find((candidate) =>
        Array.isArray(candidate.path) ? candidate.path.includes(path) : candidate.path === path
      );
      expect(entry, `${path} is not in the route table`).toBeDefined();
      expect(typeof entry!.handler, `${path} is still legacy`).toBe('function');
    }
  });

  it('are reached by the dispatcher, not by a leftover branch', () => {
    // The ported routes still resolve to their own entries — the specificity ordering that keeps
    // `/api/search` ahead of the `/api/*` catch-all has to survive the move.
    expect(matchRoute('GET', '/api/search')?.entry.path).toBe('/api/search');
    expect(matchRoute('GET', '/api/geocode')?.entry.path).toBe('/api/geocode');
    expect(matchRoute('GET', '/api/reverse')?.entry.path).toBe('/api/reverse');
    expect(matchRoute('GET', '/api/normalize-address')?.entry.path).toBe('/api/normalize-address');
  });

  it('answer 404 when the suggest index is not built', async () => {
    // A disabled feature is not there. Before the port this fell through to the lookup catch-all,
    // which answers an unregistered lookup path with a 404 — so the answer is unchanged.
    const env = createLookupTestEnv() as Env;
    env.ODA_SUGGEST_ENABLED = 'false';

    const response = await handleSuggestRoute(
      contextFor(env, new Request('https://lookup.test/api/search?q=main'))
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('NOT_FOUND');
  });

  it('answer 404 for the suggest route when the database is unbound', async () => {
    // `isOdaSuggestEnabled` is false without ODA_DB, whatever the flag says.
    const env = createLookupTestEnv() as Env;
    env.ODA_SUGGEST_ENABLED = 'true';
    env.ODA_DB = undefined;

    const response = await handleSuggestRoute(
      contextFor(env, new Request('https://lookup.test/api/search?q=main'))
    );
    expect(response.status).toBe(404);
  });

  it('do not bill a geocode response', async () => {
    // Geocode 200s are not Billable units — a product decision the billing-invariants gate
    // enforces. This is the same rule from the other side: the route does not call the meter.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/oda-handlers.ts', 'utf8')
    );
    for (const handler of ['handleGeocodeRoute', 'handleReverseRoute', 'handleNormalizeAddressRoute']) {
      const start = source.indexOf(`export async function ${handler}(`);
      const end = source.indexOf('\nexport ', start + 1);
      const body = source.slice(start, end === -1 ? undefined : end);
      expect(body, `${handler} calls the meter`).not.toContain('recordSuccessfulBillable');
    }
  });

  it('still refuse a geocode request when ODA is disabled', async () => {
    // The behaviour of the geocode routes when the feature is off: a 503, not a 404. The
    // difference from autocomplete is deliberate — geocode has a fixed contract, autocomplete is
    // an index that may not be built yet.
    const env = createLookupTestEnv() as Env;
    env.ODA_GEOCODING_ENABLED = 'false';

    const response = await fetchLookup(env, '/api/geocode?q=100+Main+St+Toronto');
    expect(response.status).toBe(503);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('ODA_NOT_ENABLED');
  });
});
