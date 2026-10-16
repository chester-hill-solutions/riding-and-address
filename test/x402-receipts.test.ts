import { describe, it, expect } from 'vitest';
import {
  handleReceiptsRequest,
  listReceipts,
  receiptsBound,
  reconciliationSummary,
  recordReceipt,
  type X402Receipt,
} from '../src/x402-receipts';
import { createRouteContext, type RouteContext } from '../src/route-context';
import type { Env } from '../src/types';

/**
 * W11 core: an x402 receipt is not written to the Customer ledger, so this store is the only
 * reconciliation trace. The rail refuses to take money without it.
 */

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
    const env = { X402_RECEIPTS: fakeKv() } as unknown as Env;
    await recordReceipt(env, receipt());
    const receipts = await listReceipts(env);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].offerId).toBe('offer-1');
  });

  it('skips a malformed stored entry rather than trusting it', async () => {
    const kv = fakeKv();
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
    const kv = fakeKv();
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
