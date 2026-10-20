import { createMemoryKv } from './helpers/memory-kv';
import { describe, it, expect } from 'vitest';
import {
  handleReceiptsRequest,
  listReceipts,
  receiptsBound,
  reconciliationSummary,
  receiptKey,
  recordReceipt,
  type X402Receipt,
} from '../src/x402-receipts';
import { createRouteContext, type RouteContext } from '../src/route-context';
import type { Env } from '../src/types';

/**
 * W11 core: an x402 receipt is not written to the Customer ledger, so this store is the only
 * reconciliation trace. The rail refuses to take money without it.
 */


const receipt = (over: Partial<X402Receipt> = {}): X402Receipt => ({
  offerId: 'offer-1',
  operation: 'lookup.point',
  settlement: { transaction: '0xabc', network: 'eip155:84532' },
  amount: { currency: 'USD', value: 0.005 },
  scope: { datasetId: 'federalridings-2024.geojson', datasetYear: 2024 },
  resultCount: 1,
  delivered: true,
  correlationId: 'corr-1',
  recordedAt: '2026-10-16T12:00:00.000Z',
  ...over,
});

const MOCK_CTX = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;

function context(env: Env, path = '/api/x402/receipts'): RouteContext {
  const request = new Request(`https://lookup.test${path}`);
  return createRouteContext({
    request,
    env,
    ctx: MOCK_CTX,
    correlationId: 'test-correlation',
    startTime: Date.now(),
  });
}

describe('receipt store', () => {
  it('reports unbound when the binding is absent', async () => {
    const env = {} as Env;
    expect(receiptsBound(env)).toBe(false);
    expect(await listReceipts(env)).toEqual([]);
  });

  it('records and reads back a receipt', async () => {
    const env = { X402_RECEIPTS: createMemoryKv() } as unknown as Env;
    await recordReceipt(env, receipt());
    const receipts = await listReceipts(env);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].offerId).toBe('offer-1');
  });

  it('skips a malformed stored entry rather than trusting it', async () => {
    const kv = createMemoryKv();
    await kv.put('x402receipt:bad', JSON.stringify({ nope: true }));
    const env = { X402_RECEIPTS: kv } as unknown as Env;
    expect(await listReceipts(env)).toEqual([]);
  });

  it('summarises delivered, failed and settled value', () => {
    const summary = reconciliationSummary([
      receipt({ offerId: 'a' }),
      receipt({ offerId: 'b', delivered: false, amount: { currency: 'USD', value: 0.005 } }),
    ]);
    expect(summary).toEqual({
      total: 2,
      delivered: 1,
      deliveryFailed: 1,
      settledValue: { USD: 0.01 },
    });
  });
});

describe('GET /api/x402/receipts', () => {
  it('returns the receipts and the reconciliation summary', async () => {
    const kv = createMemoryKv();
    const env = { X402_RECEIPTS: kv } as unknown as Env;
    await recordReceipt(env, receipt({ offerId: 'a' }));
    await recordReceipt(env, receipt({ offerId: 'b', delivered: false }));

    const response = await handleReceiptsRequest(context(env));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      receipts: unknown[];
      reconciliation: { total: number; deliveryFailed: number };
    };
    expect(body.receipts).toHaveLength(2);
    expect(body.reconciliation.total).toBe(2);
    expect(body.reconciliation.deliveryFailed).toBe(1);
  });

  it('fails closed when the store is unbound', async () => {
    const response = await handleReceiptsRequest(context({} as Env));
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code?: string }).code).toBe('RECEIPTS_UNAVAILABLE');
  });
});

describe('receipt keys fit in a KV key', () => {
  /**
   * Found by paying a live facilitator: the offer id is a signed token of roughly 512 characters, and
   * using it directly made the key 549 bytes against a 512-byte limit — so *every* receipt write
   * failed. Nothing caught it because the fake KV here did not enforce the limit. These pin the
   * invariant directly, which is what the fake could not.
   */
  const AT = '2026-10-17T21:16:13.892Z';
  const longOffer = (sig: string) => `${'a'.repeat(470)}.${sig}`;

  it('stays within 512 bytes for a realistically long offer id', () => {
    const key = receiptKey({ recordedAt: AT, offerId: longOffer('b'.repeat(43)) });
    expect(new TextEncoder().encode(key).length).toBeLessThanOrEqual(512);
  });

  it('is stable for the same offer and distinct for different ones', () => {
    const a = receiptKey({ recordedAt: AT, offerId: longOffer('sigA') });
    const b = receiptKey({ recordedAt: AT, offerId: longOffer('sigB') });
    expect(a).not.toBe(b);
    // Same offer, same key — reconciliation rewrites the receipt in place.
    expect(receiptKey({ recordedAt: AT, offerId: longOffer('sigA') })).toBe(a);
  });

  it('still separates two offers for the same input, which differ only late in the token', () => {
    // Two quotes for one postal code differ only in the expiry, deep inside the payload — so a
    // truncated *prefix* of the offer id would collide. The signature half does not.
    const early = 'x'.repeat(400) + 'expiryOne' + '.sigA';
    const late = 'x'.repeat(400) + 'expiryTwo' + '.sigB';
    expect(receiptKey({ recordedAt: AT, offerId: early })).not.toBe(
      receiptKey({ recordedAt: AT, offerId: late })
    );
  });
});
