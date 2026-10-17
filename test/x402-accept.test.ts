import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleAcceptRequest, handleQuoteRequest } from '../src/offers';
import { createRouteContext, type RouteContext } from '../src/route-context';
import { createLookupTestEnv, TORONTO_LAT, TORONTO_LON } from './helpers/lookup-test-env';
import { PAYMENT_REQUIRED_HEADER, PAYMENT_RESPONSE_HEADER, PAYMENT_SIGNATURE_HEADER } from '../src/x402';
import type { Env } from '../src/types';

/**
 * W6: an authorized agent pays and receives the quoted lookup. The facilitator is stubbed at the
 * fetch boundary, so the whole verify → settle → deliver path is exercised without money.
 */

const SECRET = 'test-offer-secret';

const X402_ENV = {
  X402_ENABLED: 'true',
  X402_PAY_TO: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
  X402_NETWORK: 'eip155:84532',
  X402_ASSET: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  X402_FACILITATOR_URL: 'https://facilitator.test',
};

const MOCK_CTX = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;

/** Minimal KV double for the receipt store. */
function fakeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string, type?: string) => {
      const value = store.get(key);
      if (value === undefined) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async ({ prefix }: { prefix?: string } = {}) => ({
      keys: [...store.keys()]
        .filter((name) => !prefix || name.startsWith(prefix))
        .map((name) => ({ name })),
      list_complete: true,
      cacheStatus: null,
    }),
  } as unknown as KVNamespace;
}

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...createLookupTestEnv(),
    OFFER_SIGNING_SECRET: SECRET,
    ...X402_ENV,
    X402_RECEIPTS: fakeKv(),
    ...overrides,
  } as unknown as Env;
}

function context(
  path: string,
  env: Env,
  headers: Record<string, string> = {},
  method = 'POST'
): RouteContext {
  const request = new Request(`https://lookup.test${path}`, { method, headers });
  return createRouteContext({
    request,
    env,
    ctx: MOCK_CTX,
    correlationId: 'test-correlation',
    startTime: Date.now(),
  });
}

const paymentSignature = () =>
  btoa(JSON.stringify({ x402Version: 2, payload: { signature: '0xdeadbeef' } }));

/** Stub the facilitator's /verify and /settle. */
function stubFacilitator(options: { verify?: boolean; settle?: Record<string, unknown>[] } = {}) {
  const settleResponses = options.settle ?? [{ success: true, transaction: '0xabc', network: 'eip155:84532' }];
  let settleCall = 0;
  globalThis.fetch = vi.fn(async (url: string | URL) => {
    const target = String(url);
    if (target.endsWith('/verify')) {
      return new Response(JSON.stringify({ isValid: options.verify ?? true }), { status: 200 });
    }
    if (target.endsWith('/settle')) {
      const body = settleResponses[Math.min(settleCall, settleResponses.length - 1)];
      settleCall += 1;
      return new Response(JSON.stringify(body), { status: 200 });
    }
    throw new Error(`unexpected facilitator call: ${target}`);
  }) as typeof fetch;
}

/** Get a real offer for a point inside the Toronto fixture. The quote side is a GET; POST is the
 * polygon form. */
async function quote(env: Env): Promise<string> {
  const response = await handleQuoteRequest(
    context(`/api/quote?lat=${TORONTO_LAT}&lon=${TORONTO_LON}`, env, {}, 'GET')
  );
  const body = (await response.json()) as { offerId: string };
  return body.offerId;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('POST /api/quote/accept', () => {
  it('answers 402 with x402 payment requirements when unpaid', async () => {
    const env = baseEnv();
    const offerId = await quote(env);
    const response = await handleAcceptRequest(context(`/api/quote/accept?offer=${offerId}`, env));

    expect(response.status).toBe(402);
    const header = response.headers.get(PAYMENT_REQUIRED_HEADER);
    expect(header).toBeTruthy();
    const requirements = JSON.parse(atob(header!));
    expect(requirements.x402Version).toBe(2);
    const accepted = requirements.accepts[0];
    expect(accepted.scheme).toBe('exact');
    expect(accepted.network).toBe('eip155:84532');
    // The offer's ceiling (0.005 USD) at 6 decimals, never more than the offer itself.
    expect(accepted.amount).toBe('5000');
    expect(accepted.payTo).toBe(X402_ENV.X402_PAY_TO);
  });

  it('settles and delivers the quoted lookup with a receipt', async () => {
    const env = baseEnv();
    stubFacilitator();
    const offerId = await quote(env);

    const response = await handleAcceptRequest(
      context(`/api/quote/accept?offer=${offerId}`, env, {
        [PAYMENT_SIGNATURE_HEADER]: paymentSignature(),
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get(PAYMENT_RESPONSE_HEADER)).toBeTruthy();
    const body = (await response.json()) as {
      receipt: { offerId: string; settlement: { transaction?: string } };
      result: { riding?: string };
    };
    expect(body.receipt.offerId).toBe(offerId);
    expect(body.receipt.settlement.transaction).toBe('0xabc');
    // The delivered lookup is exactly the one the offer bound.
    expect(body.result.riding).toBeTruthy();
  });

  it('re-challenges with 402 when the payment is not valid', async () => {
    const env = baseEnv();
    stubFacilitator({ verify: false });
    const offerId = await quote(env);

    const response = await handleAcceptRequest(
      context(`/api/quote/accept?offer=${offerId}`, env, {
        [PAYMENT_SIGNATURE_HEADER]: paymentSignature(),
      })
    );

    expect(response.status).toBe(402);
    expect(response.headers.get(PAYMENT_REQUIRED_HEADER)).toBeTruthy();
  });

  it('treats settlement_pending as non-terminal, retrying once and never re-charging blindly', async () => {
    const env = baseEnv();
    stubFacilitator({
      settle: [
        { success: false, pending: true, transaction: '0xpending' },
        { success: false, pending: true, transaction: '0xpending' },
      ],
    });
    const offerId = await quote(env);

    const response = await handleAcceptRequest(
      context(`/api/quote/accept?offer=${offerId}`, env, {
        [PAYMENT_SIGNATURE_HEADER]: paymentSignature(),
      })
    );

    expect(response.status).toBe(502);
    expect(((await response.json()) as { code?: string }).code).toBe('SETTLEMENT_PENDING');
  });

  it('re-challenges with 402 when settlement fails', async () => {
    const env = baseEnv();
    stubFacilitator({ settle: [{ success: false, errorReason: 'insufficient_funds' }] });
    const offerId = await quote(env);

    const response = await handleAcceptRequest(
      context(`/api/quote/accept?offer=${offerId}`, env, {
        [PAYMENT_SIGNATURE_HEADER]: paymentSignature(),
      })
    );

    expect(response.status).toBe(402);
  });

  it('fails closed when the rail is not configured', async () => {
    const env = baseEnv({ X402_ENABLED: 'false' });
    const offerId = await quote(env);
    const response = await handleAcceptRequest(context(`/api/quote/accept?offer=${offerId}`, env));

    expect(response.status).toBe(503);
    expect(((await response.json()) as { code?: string }).code).toBe('PAYMENTS_UNAVAILABLE');
  });

  it('fails closed when the receipt store is unbound', async () => {
    // A settled payment with nowhere to record its receipt cannot be reconciled.
    const env = baseEnv({ X402_RECEIPTS: undefined });
    const offerId = await quote(env);
    const response = await handleAcceptRequest(context(`/api/quote/accept?offer=${offerId}`, env));

    expect(response.status).toBe(503);
    expect(((await response.json()) as { code?: string }).code).toBe('PAYMENTS_UNAVAILABLE');
  });

  it('rejects a missing or invalid offer', async () => {
    const env = baseEnv();
    const missing = await handleAcceptRequest(context('/api/quote/accept', env));
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { code?: string }).code).toBe('OFFER_REQUIRED');

    const invalid = await handleAcceptRequest(context('/api/quote/accept?offer=garbage.token', env));
    expect(invalid.status).toBe(410);
    expect(((await invalid.json()) as { code?: string }).code).toBe('OFFER_INVALID');
  });

  it('rejects a malformed PAYMENT-SIGNATURE header', async () => {
    const env = baseEnv();
    const offerId = await quote(env);
    const response = await handleAcceptRequest(
      context(`/api/quote/accept?offer=${offerId}`, env, {
        [PAYMENT_SIGNATURE_HEADER]: 'not-base64-json',
      })
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code?: string }).code).toBe('PAYMENT_MALFORMED');
  });
});
