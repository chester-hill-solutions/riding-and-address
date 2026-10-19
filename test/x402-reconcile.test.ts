import { createMemoryKv } from './helpers/memory-kv';
import { describe, it, expect } from 'vitest';
import { handleReconcileRequest, reconcileReceipts, type ChainClient } from '../src/x402-reconcile';
import { recordReceipt, listReceipts, type X402Receipt } from '../src/x402-receipts';
import { createRouteContext, type RouteContext } from '../src/route-context';
import type { Env } from '../src/types';

/**
 * A receipt says what we settled and delivered; only the chain says whether the settlement is real.
 * This job is the difference, and its report is what an operator acts on.
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

function envWith(kv: KVNamespace): Env {
  return { X402_RECEIPTS: kv } as unknown as Env;
}

const chain = (status: 'confirmed' | 'failed' | 'unknown'): ChainClient => ({
  statusOf: async () => status,
});

const MOCK_CTX = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;

function context(env: Env): RouteContext {
  const request = new Request('https://lookup.test/api/x402/reconcile', { method: 'POST' });
  return createRouteContext({
    request,
    env,
    ctx: MOCK_CTX,
    correlationId: 'test-correlation',
    startTime: Date.now(),
  });
}

describe('reconcileReceipts', () => {
  it('records the chain status of each settled transaction', async () => {
    const kv = createMemoryKv();
    const env = envWith(kv);
    await recordReceipt(env, receipt({ offerId: 'a' }));
    await recordReceipt(env, receipt({ offerId: 'b', recordedAt: '2026-10-16T12:01:00.000Z' }));

    const report = await reconcileReceipts(env, chain('confirmed'), {
      now: new Date('2026-10-16T13:00:00.000Z'),
    });

    expect(report.checked).toBe(2);
    expect(report.confirmed).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.deliveryFailed).toBe(0);

    const stored = await listReceipts(env);
    expect(stored.every((r) => r.confirmation === 'confirmed')).toBe(true);
    expect(stored.every((r) => r.checkedAt === '2026-10-16T13:00:00.000Z')).toBe(true);
  });

  it('separates failed and unknown settlements and counts undelivered receipts', async () => {
    const kv = createMemoryKv();
    const env = envWith(kv);
    await recordReceipt(env, receipt({ offerId: 'ok' }));
    await recordReceipt(env, receipt({ offerId: 'bad', recordedAt: '2026-10-16T12:01:00.000Z' }));
    // No transaction to check, and never delivered.
    await recordReceipt(
      env,
      receipt({
        offerId: 'undelivered',
        recordedAt: '2026-10-16T12:02:00.000Z',
        settlement: { network: 'eip155:84532' },
        delivered: false,
      })
    );

    let call = 0;
    const flaky: ChainClient = {
      statusOf: async () => (call++ === 0 ? 'failed' : 'unknown'),
    };

    const report = await reconcileReceipts(env, flaky);

    expect(report.checked).toBe(2); // the third receipt carries no transaction
    expect(report.failed).toBe(1);
    expect(report.unknown).toBe(1);
    expect(report.deliveryFailed).toBe(1);
  });

  it('does nothing when no receipts are stored', async () => {
    const report = await reconcileReceipts(envWith(createMemoryKv()), chain('confirmed'));
    expect(report).toMatchObject({ checked: 0, confirmed: 0, failed: 0, unknown: 0, deliveryFailed: 0 });
  });
});

describe('POST /api/x402/reconcile', () => {
  it('fails closed when no RPC endpoint is configured', async () => {
    const response = await handleReconcileRequest(context(envWith(createMemoryKv())));
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code?: string }).code).toBe('RECONCILE_UNAVAILABLE');
  });

  it('runs reconciliation against the configured chain', async () => {
    const kv = createMemoryKv();
    const env = { X402_RECEIPTS: kv, X402_RPC_URL: 'https://rpc.test' } as unknown as Env;
    await recordReceipt(env, receipt());

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ result: { status: '0x1' } }), { status: 200 })) as typeof fetch;
    try {
      const response = await handleReconcileRequest(context(env));
      expect(response.status).toBe(200);
      const report = (await response.json()) as { confirmed: number; checked: number };
      expect(report.checked).toBe(1);
      expect(report.confirmed).toBe(1);
    } finally {
      globalThis.fetch = undefined as unknown as typeof fetch;
    }
  });
});
