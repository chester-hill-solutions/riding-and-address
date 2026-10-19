import { beforeEach, describe, expect, it } from 'vitest';
import Stripe from 'stripe';

import { action } from '../app/routes/api.stripe-webhook';
import { fakeUsageNamespace } from '../../test/helpers/fake-usage-do';
import { createPortalDb, portalTestEnv, withPortalEnv, type PortalDb } from './helpers/portal-db';

/**
 * The Stripe webhook that releases a paid upload.
 *
 * **This is the money path.** The upload checkout is the one checkout enabled in production
 * (`UPLOAD_CHECKOUT_ENABLED=true`), and this route is the only thing that turns a paid upload from
 * "awaiting payment" into "processing". If it accepted an unsigned request, or released an upload
 * whose payment had not happened, the product would give away paid work — and there was no test
 * here at all.
 *
 * The route owns four things, and each is asserted below: it refuses a request that is not a POST,
 * it refuses to act when Stripe is not configured, it refuses a body whose signature does not
 * verify, and it refuses a checkout event that does not name an upload.
 *
 * The happy path is walked through the *real* Durable Object, so "the upload was released" is
 * asserted by the upload's own state rather than by a mock's call log.
 */

const WEBHOOK_SECRET = 'whsec_test_secret_for_the_portal_suite';
const STRIPE_SECRET = 'sk_test_portal_suite';

/** A sheet with enough rows that the quote is a paid one rather than a free allowance. */
function csvWithRows(count: number): string {
  const lines = ['address,postal,city,province'];
  for (let i = 0; i < count; i += 1) {
    lines.push(`${i + 1} Example Street,K1A 0B1,Ottawa,ON`);
  }
  return lines.join('\n');
}

let portalDb: PortalDb;
/**
 * One usage namespace for the whole test.
 *
 * The fake namespace keeps its Durable Object instances in a map keyed by name, so a *new*
 * namespace is a *new* set of instances — an upload created through one would be invisible to
 * another. The upload is created, started and released, so it has to be the same namespace
 * throughout.
 */
let usage: DurableObjectNamespace;

beforeEach(() => {
  portalDb = createPortalDb();
  usage = fakeUsageNamespace();
});

function env() {
  return portalTestEnv(portalDb, {
    STRIPE_SECRET_KEY: STRIPE_SECRET,
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    API_KEY_USAGE: usage,
  });
}

/** A webhook request carrying a signature the SDK generated over `payload`. */
function webhookRequest(payload: string, secret = WEBHOOK_SECRET): Request {
  const stripe = new Stripe(STRIPE_SECRET);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request('https://portal.test/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
    body: payload,
  });
}

/** The Durable Object's own view of an upload. */
async function uploadState(customerId: string, id: string): Promise<{ status?: string }> {
  const stub = usage.get(usage.idFromName(`customer:${customerId}`));
  const response = await stub.fetch(`https://usage/uploads/get?id=${encodeURIComponent(id)}`);
  return (await response.json()) as { status?: string };
}

/** Create a paid upload and put it in the "awaiting payment" state. */
async function quotedUpload(customerId: string): Promise<{ id: string; chargeCents: number }> {
  const stub = usage.get(usage.idFromName(`customer:${customerId}`));

  const created = await stub.fetch('https://usage/uploads/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: csvWithRows(10), name: 'test sheet', freeEligible: false }),
  });
  const job = (await created.json()) as { id: string; chargeCents: number; status: string };
  expect(job.chargeCents).toBeGreaterThan(0);
  expect(job.status).toBe('quoted');

  const started = await stub.fetch(`https://usage/uploads/start?id=${encodeURIComponent(job.id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'cs_test_123', customerId: 'cus_test_123' }),
  });
  expect(started.status).toBe(200);
  expect(((await started.json()) as { status: string }).status).toBe('checkout');

  return job;
}

/**
 * The Stripe event shape the route reads.
 *
 * `metadata.purpose` is what the route checks before it releases anything, and it is what
 * `createUploadCheckoutSession` puts there — so a real checkout event carries it and an event
 * that does not is not about an upload at all.
 */
function checkoutEvent(metadata: Record<string, string> | undefined, overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_test_1',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123',
        mode: 'payment',
        customer: 'cus_test_123',
        payment_status: 'paid',
        amount_total: 50,
        currency: 'usd',
        metadata,
        ...overrides,
      },
    },
  };
}

/** The metadata a real upload checkout session carries. */
function uploadMetadata(uploadId: string, customerId: string) {
  return { purpose: 'sheet_upload', uploadId, customerId };
}

describe('the Stripe webhook', () => {
  it('refuses a request that is not a POST', async () => {
    const response = await withPortalEnv(env(), () =>
      action({
        request: new Request('https://portal.test/api/stripe/webhook'),
        params: {},
        context: {} as never,
      } as never)
    );
    expect(response.status).toBe(405);
  });

  it('refuses to act when Stripe is not configured', async () => {
    // Not configured is not "allow": a deployment without the webhook secret must not release
    // anything on anybody's say-so.
    const response = await withPortalEnv(portalTestEnv(portalDb, { API_KEY_USAGE: fakeUsageNamespace() }), () =>
      action({
        request: new Request('https://portal.test/api/stripe/webhook', { method: 'POST' }),
        params: {},
        context: {} as never,
      } as never)
    );
    expect(response.status).toBe(503);
  });

  it('refuses a request with no signature', async () => {
    const response = await withPortalEnv(env(), () =>
      action({
        request: new Request('https://portal.test/api/stripe/webhook', {
          method: 'POST',
          body: JSON.stringify(checkoutEvent(uploadMetadata('u1', 'c1'))),
        }),
        params: {},
        context: {} as never,
      } as never)
    );
    expect(response.status).toBe(400);
  });

  it('refuses a body whose signature does not verify, and releases nothing', async () => {
    const customerId = 'cust_unsigned';
    const job = await quotedUpload(customerId);

    // Signed with the wrong secret.
    const payload = JSON.stringify(checkoutEvent(uploadMetadata(job.id, customerId), { amount_total: job.chargeCents }));
    const response = await withPortalEnv(env(), () =>
      action({ request: webhookRequest(payload, 'whsec_a_different_secret'), params: {}, context: {} as never } as never)
    );

    expect(response.status).toBe(400);
    // The upload is still awaiting payment. This is the assertion that matters: a forged webhook
    // must not give the work away.
    expect((await uploadState(customerId, job.id)).status).toBe('checkout');
  });

  it('ignores a checkout event that is not about an upload', async () => {
    // The event names no upload, so there is nothing to release. Answering 200 is right: the route
    // has done its job, and refusing would make Stripe retry an event it will never accept.
    const payload = JSON.stringify(checkoutEvent(undefined));
    const response = await withPortalEnv(env(), () =>
      action({ request: webhookRequest(payload), params: {}, context: {} as never } as never)
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('refuses an upload checkout event that does not name an upload', async () => {
    // The event says it is about an upload but names neither the upload nor the customer. Refusing
    // is right here: the event is malformed, and Stripe should retry it rather than have it
    // silently do nothing.
    const payload = JSON.stringify(checkoutEvent({ purpose: 'sheet_upload' }));
    const response = await withPortalEnv(env(), () =>
      action({ request: webhookRequest(payload), params: {}, context: {} as never } as never)
    );
    expect(response.status).toBe(400);
  });

  it('ignores an event that is not a checkout completion', async () => {
    const payload = JSON.stringify({ id: 'evt_2', type: 'customer.created', data: { object: {} } });
    const response = await withPortalEnv(env(), () =>
      action({ request: webhookRequest(payload), params: {}, context: {} as never } as never)
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('releases the upload when the payment is confirmed', async () => {
    const customerId = 'cust_paid';
    const job = await quotedUpload(customerId);

    const payload = JSON.stringify(
      checkoutEvent(uploadMetadata(job.id, customerId), { amount_total: job.chargeCents })
    );
    const response = await withPortalEnv(env(), () =>
      action({ request: webhookRequest(payload), params: {}, context: {} as never } as never)
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    // The upload moved from "awaiting payment" to "processing" — the whole point of the route.
    expect((await uploadState(customerId, job.id)).status).toBe('processing');
  });

  it('is safe to replay', async () => {
    // Stripe retries a webhook it does not get a 2xx for, so the same event will arrive more than
    // once. The route must not fail the second time, or the retry loop never ends.
    const customerId = 'cust_replay';
    const job = await quotedUpload(customerId);
    const payload = JSON.stringify(
      checkoutEvent(uploadMetadata(job.id, customerId), { amount_total: job.chargeCents })
    );

    const first = await withPortalEnv(env(), () =>
      action({ request: webhookRequest(payload), params: {}, context: {} as never } as never)
    );
    const second = await withPortalEnv(env(), () =>
      action({ request: webhookRequest(payload), params: {}, context: {} as never } as never)
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await uploadState(customerId, job.id)).status).toBe('processing');
  });
});
