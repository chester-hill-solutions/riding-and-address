import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordSuccessfulBillable, peekCustomerUsage, type BillableAuthContext } from '../src/billing';
import { clearCustomerCache, putCustomer } from '../src/customer';
import { InMemoryUsageLedger, StaticUsageLedger } from '../src/usage-ledger';
import { createProjectionTestEnv } from './helpers/lookup-test-env';
import type { CustomerRecord } from '../src/customer';
import type { Env } from '../src/types';

/**
 * The fuse, the allowance and the meter.
 *
 * `src/billing.ts` sat at 70% statements and 64% branch coverage while owning the decision that
 * decides **whether a request is chargeable and whether a Customer has run out**. A mistake here is
 * a customer charged twice, or not charged, or billed past the fuse they were promised.
 *
 * The ledger is injected, so these tests measure the *decision* rather than the Durable Object's
 * wire format — the same property `src/usage-ledger.ts` documents for its own fakes.
 */

function customer(over: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: 'cust_1',
    plan: 'free',
    fuseLimit: 1000,
    ...over,
  };
}

function context(cust: CustomerRecord, key?: { id: string }): BillableAuthContext {
  return { customer: cust, ...(key ? { key: key as never } : {}) };
}

let env: Env;

beforeEach(() => {
  clearCustomerCache();
  env = createProjectionTestEnv();
});

describe('the monthly fuse', () => {
  it('allows a unit while the Customer is under the limit', async () => {
    const billed = await recordSuccessfulBillable(env, context(customer({ fuseLimit: 3 })), {
      ledger: new InMemoryUsageLedger(),
    });
    expect(billed.allowed).toBe(true);
    expect(billed.status).toBe(200);
  });

  it('refuses the unit that would cross the limit, and says why', async () => {
    const ledger = new InMemoryUsageLedger();
    const ctx = context(customer({ fuseLimit: 1 }));

    expect((await recordSuccessfulBillable(env, ctx, { ledger })).allowed).toBe(true);

    const denied = await recordSuccessfulBillable(env, ctx, { ledger });
    expect(denied.allowed).toBe(false);
    expect(denied.status).toBe(429);
    expect(denied.body).toMatchObject({ code: 'FUSE_EXCEEDED', error: 'Monthly usage fuse exceeded' });
    expect(denied.body?.limit).toBe(1);
    expect(denied.body?.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it('keeps serving a soft-warn Customer past the fuse', async () => {
    // A soft-warn fuse is a warning, not a wall. The counter still runs — the usage is still
    // counted — but the request is allowed through.
    const ledger = new InMemoryUsageLedger();
    const ctx = context(customer({ fuseLimit: 1, fuseSoftWarn: true }));

    expect((await recordSuccessfulBillable(env, ctx, { ledger })).allowed).toBe(true);
    expect((await recordSuccessfulBillable(env, ctx, { ledger })).allowed).toBe(true);
    expect((await recordSuccessfulBillable(env, ctx, { ledger })).allowed).toBe(true);
  });

  it('lets an unlimited Customer through without a fuse', async () => {
    // `fuseLimit: 0` means unlimited — which is how Enterprise is configured. The unit is still
    // counted; it is just not refused.
    const ledger = new InMemoryUsageLedger();
    const ctx = context(customer({ plan: 'enterprise', fuseLimit: 0 }));

    for (let i = 0; i < 5; i += 1) {
      expect((await recordSuccessfulBillable(env, ctx, { ledger })).allowed).toBe(true);
    }
    expect((await peekCustomerUsage(env, 'cust_1', { ledger })).count).toBe(5);
  });

  it('refuses when the ledger says the fuse is spent', async () => {
    // The ledger is the counter; the decision is the billing engine's. Both are asserted.
    const ledger = new StaticUsageLedger({
      allowed: false,
      count: 1000,
      limit: 1000,
      month: '2026-10',
    });
    const billed = await recordSuccessfulBillable(env, context(customer({ fuseLimit: 1000 })), { ledger });
    expect(billed.allowed).toBe(false);
    expect(billed.body?.code).toBe('FUSE_EXCEEDED');
  });
});

describe('the fuse limit a Customer gets', () => {
  it('uses the Customer’s own limit when it has one', async () => {
    const billed = await recordSuccessfulBillable(env, context(customer({ fuseLimit: 7 })), {
      ledger: new StaticUsageLedger({ allowed: false, count: 7, limit: 7, month: '2026-10' }),
    });
    expect(billed.body?.limit).toBe(7);
  });

  it('falls back to the environment allowance for a free Customer with no limit', async () => {
    env.FREE_MONTHLY_ALLOWANCE = '250';
    const billed = await recordSuccessfulBillable(env, context(customer({ fuseLimit: 0, plan: 'free' })), {
      ledger: new StaticUsageLedger({ allowed: false, count: 250, limit: 250, month: '2026-10' }),
    });
    expect(billed.body?.limit).toBe(250);
  });
});

describe('the Stripe meter', () => {
  it('is not called for a free Customer', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    env.STRIPE_SECRET_KEY = 'sk_test_meter';
    await recordSuccessfulBillable(env, context(customer({ plan: 'free' })), {
      ledger: new InMemoryUsageLedger(),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('is called once for a metered Customer, and carries the customer and the month', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 })
    );
    env.STRIPE_SECRET_KEY = 'sk_test_meter';
    env.STRIPE_METER_EVENT_NAME = 'riding_lookup_api_call';

    await recordSuccessfulBillable(
      env,
      context(customer({ plan: 'metered', stripeCustomerId: 'cus_123' })),
      { ledger: new InMemoryUsageLedger() }
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.stripe.com/v1/billing/meter_events');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('payload[stripe_customer_id]')).toBe('cus_123');
    expect(body.get('payload[value]')).toBe('1');
    expect(body.get('identifier')).toMatch(/^cust_1:\d{4}-\d{2}:/);
    fetchSpy.mockRestore();
  });

  it('is called for an enterprise Customer too', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    env.STRIPE_SECRET_KEY = 'sk_test_meter';
    await recordSuccessfulBillable(
      env,
      context(customer({ plan: 'enterprise', fuseLimit: 0, stripeCustomerId: 'cus_123' })),
      { ledger: new InMemoryUsageLedger() }
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('is not called when there is no Stripe customer to bill', async () => {
    // No `stripeCustomerId` means there is nothing to bill against; the call is skipped rather
    // than sent and rejected.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    env.STRIPE_SECRET_KEY = 'sk_test_meter';
    await recordSuccessfulBillable(env, context(customer({ plan: 'metered' })), {
      ledger: new InMemoryUsageLedger(),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('is not called when there is no Stripe secret', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await recordSuccessfulBillable(
      env,
      context(customer({ plan: 'metered', stripeCustomerId: 'cus_123' })),
      { ledger: new InMemoryUsageLedger() }
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('does not fail the request when Stripe refuses the event', async () => {
    // The Durable Object ledger is canonical; Stripe is a meter that catches up (ADR-0002). A
    // rejected meter event must not refuse a request the Customer was entitled to.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('nope', { status: 500 })
    );
    env.STRIPE_SECRET_KEY = 'sk_test_meter';

    const billed = await recordSuccessfulBillable(
      env,
      context(customer({ plan: 'metered', stripeCustomerId: 'cus_123' })),
      { ledger: new InMemoryUsageLedger() }
    );
    expect(billed.allowed).toBe(true);
    fetchSpy.mockRestore();
  });

  it('does not fail the request when Stripe is unreachable', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    env.STRIPE_SECRET_KEY = 'sk_test_meter';

    const billed = await recordSuccessfulBillable(
      env,
      context(customer({ plan: 'metered', stripeCustomerId: 'cus_123' })),
      { ledger: new InMemoryUsageLedger() }
    );
    expect(billed.allowed).toBe(true);
    fetchSpy.mockRestore();
  });
});

describe('reading a Customer’s usage', () => {
  it('reports the month and the count', async () => {
    // The Customer has to be in the key store: `peekCustomerUsage` reads the record from there to
    // learn the limit, and a Customer that only exists as an object is one it cannot see.
    await putCustomer(env, customer({ fuseLimit: 10 }));
    const ledger = new InMemoryUsageLedger();
    await recordSuccessfulBillable(env, context(customer({ fuseLimit: 10 })), { ledger });

    const usage = await peekCustomerUsage(env, 'cust_1', { ledger });
    expect(usage.month).toMatch(/^\d{4}-\d{2}$/);
    expect(usage.count).toBe(1);
    expect(usage.limit).toBe(10);
  });

  it('reports the free allowance for a Customer that does not exist', async () => {
    // An unknown Customer gets the default limit rather than an error, so the page that shows it
    // still renders.
    env.FREE_MONTHLY_ALLOWANCE = '1000';
    const usage = await peekCustomerUsage(env, 'cust_missing', {
      ledger: new StaticUsageLedger({ allowed: true, count: 0, limit: 1000, month: '2026-10' }),
    });
    expect(usage.limit).toBe(1000);
  });
});
