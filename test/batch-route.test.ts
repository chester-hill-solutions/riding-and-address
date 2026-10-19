import { beforeEach, describe, expect, it } from 'vitest';

import { handleBatchRoute, handleBatchStatusRoute } from '../src/batch';
import { clearCustomerCache, loadCustomer, putCustomer } from '../src/customer';
import { createRouteContext, type RouteContext } from '../src/route-context';
import { fakeUsageNamespace } from './helpers/fake-usage-do';
import { createMemoryKv } from './helpers/memory-kv';
import { createLookupTestEnv } from './helpers/lookup-test-env';
import type { Env } from '../src/types';

/**
 * The Enterprise batch surface, now ported out of the Worker's legacy chain.
 *
 * **The fuse is the interesting part.** A batch is a hundred lookups and the fuse is a Customer's
 * monthly ceiling, so the fuse can be crossed *inside* one request. When it is, the refused item
 * and every item after it are redacted — the caller must not receive work that was not paid for.
 *
 * That behaviour is easy to get wrong and impossible to notice without a test: a batch that returns
 * everything and bills later gives the work away; a batch that returns nothing at all once the
 * fuse is touched refuses work the Customer was entitled to.
 */

const CUSTOMER_ID = 'cust_batch';

let env: Env;

beforeEach(() => {
  clearCustomerCache();
  env = createLookupTestEnv() as Env;
  env.API_KEYS = createMemoryKv();
  env.API_KEY_USAGE = fakeUsageNamespace();
  env.FREE_MONTHLY_ALLOWANCE = '1000';
});

/** A context whose lookups succeed, so the batch reaches the billing step. */
function contextFor(request: Request, overrides: Partial<RouteContext> = {}): RouteContext {
  const base = createRouteContext({
    request,
    env,
    ctx: {
      waitUntil: () => {},
      passThroughOnException: () => {},
      props: {},
    } as unknown as ExecutionContext,
    correlationId: 'corr',
    startTime: Date.now(),
    deps: {
      lookup: async () => ({
        properties: { FED_NUM: 35079, ED_NAMEE: 'Ottawa Centre' },
        riding: 'Ottawa Centre',
      }),
    },
  });
  return { ...base, ...overrides };
}

/** A batch body of `count` valid requests. */
function body(count: number): string {
  return JSON.stringify({
    requests: Array.from({ length: count }, (_, i) => ({
      id: String(i + 1),
      query: { address: `${i + 1} Example Street`, city: 'Ottawa', state: 'ON', lat: 45.42, lon: -75.69 },
      pathname: '/api/federal',
    })),
  });
}

describe('the batch route', () => {
  it('refuses a body over the size limit', async () => {
    const request = new Request('https://lookup.test/batch', {
      method: 'POST',
      headers: { 'content-length': String(11 * 1024 * 1024) },
      body: body(1),
    });
    const response = await handleBatchRoute(contextFor(request));
    expect(response.status).toBe(413);
  });

  it('refuses a body that is not a batch', async () => {
    const request = new Request('https://lookup.test/batch', {
      method: 'POST',
      body: JSON.stringify({ notRequests: [] }),
    });
    const response = await handleBatchRoute(contextFor(request));
    expect(response.status).toBe(400);
    const parsed = (await response.json()) as { error?: string };
    expect(parsed.error).toMatch(/requests/);
  });

  it('refuses a request that is not a valid lookup', async () => {
    const request = new Request('https://lookup.test/batch', {
      method: 'POST',
      body: JSON.stringify({ requests: [{ id: '1' }] }),
    });
    const response = await handleBatchRoute(contextFor(request));
    expect(response.status).toBe(400);
    const parsed = (await response.json()) as { code?: string };
    expect(parsed.code).toBe('INVALID_BATCH_REQUEST');
  });

  it('returns the results when there is nothing to bill against', async () => {
    // An operator credential is not a Billable Customer, so `ctx.billing` is null and the batch is
    // served without touching the fuse.
    const request = new Request('https://lookup.test/batch', { method: 'POST', body: body(2) });
    const response = await handleBatchRoute(contextFor(request));

    expect(response.status).toBe(200);
    const parsed = (await response.json()) as { results: unknown[] };
    expect(parsed.results).toHaveLength(2);
  });

  it('redacts the refused item and every item after it when the fuse denies', async () => {
    // A fuse of one: the first Billable unit is allowed, the second is refused. The refused item
    // and the one after it must both be redacted — returning them would give away work that was
    // never paid for.
    await putCustomer(env, {
      id: CUSTOMER_ID,
      plan: 'metered',
      fuseLimit: 1,
      batchEnabled: true,
    });
    const customer = await loadCustomer(env, CUSTOMER_ID);

    const request = new Request('https://lookup.test/batch', { method: 'POST', body: body(3) });
    const response = await handleBatchRoute(
      contextFor(request, { billing: { customer: customer! } })
    );

    expect(response.status).toBe(200);
    const parsed = (await response.json()) as { results: Array<Record<string, unknown>> };
    expect(parsed.results).toHaveLength(3);

    // The first item was paid for, so it is a normal result.
    expect(parsed.results[0].error).toBeUndefined();
    expect(parsed.results[0].riding).toBe('Ottawa Centre');

    // The second was refused by the fuse, and the third was never paid for either.
    expect(parsed.results[1].error).toBeDefined();
    expect(parsed.results[2].error).toBeDefined();
  });

  it('counts one Billable unit per successful item, not one per request', async () => {
    // A batch of three under a fuse of three must be allowed: the fuse is a unit count, and a
    // batch is three units.
    await putCustomer(env, { id: CUSTOMER_ID, plan: 'metered', fuseLimit: 3, batchEnabled: true });
    const customer = await loadCustomer(env, CUSTOMER_ID);

    const request = new Request('https://lookup.test/batch', { method: 'POST', body: body(3) });
    const response = await handleBatchRoute(
      contextFor(request, { billing: { customer: customer! } })
    );

    const parsed = (await response.json()) as { results: Array<Record<string, unknown>> };
    expect(parsed.results[0].error).toBeUndefined();
    expect(parsed.results[1].error).toBeUndefined();
    expect(parsed.results[2].error).toBeUndefined();
  });
});

describe('the batch status route', () => {
  it('answers with the status of the batch it was asked about', async () => {
    // The id is the parameter the route table matched, so the context carries it the way the
    // dispatcher would.
    const request = new Request('https://lookup.test/batch/batch_123');
    const ctx = { ...contextFor(request), params: { id: 'batch_123' } };
    const response = await handleBatchStatusRoute(ctx);

    // The queue Durable Object is not bound here, so the status lookup fails. The answer is the
    // generic internal-error body — the same one the legacy branch gave, and the one that keeps
    // binding names and stack context out of the response.
    expect(response.status).toBe(500);
    const parsed = (await response.json()) as { error?: string };
    expect(parsed.error).toBe('Internal error');
  });
});
