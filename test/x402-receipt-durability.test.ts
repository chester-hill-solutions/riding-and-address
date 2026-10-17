import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAreaOffer } from '../src/offers';
import { listReceipts, reconciliationSummary } from '../src/x402-receipts';
import { createD1Shim, createOdaSqlite, seedOdaRows } from './helpers/oda-sqlite';
import { fakeUsageNamespace } from './helpers/fake-usage-do';
import { createLookupTestEnv, fetchLookup, TORONTO_LAT, TORONTO_LON } from './helpers/lookup-test-env';
import type { OdaMemoryAddressRow } from './helpers/oda-memory-db';
import { PAYMENT_SIGNATURE_HEADER } from '../src/x402';
import type { Env } from '../src/types';

/**
 * #129: a settled payment must survive a delivery or receipt-store failure.
 *
 * The order used to be deliver → decode → record, so a delivery that threw, or a body that could not
 * be decoded, lost a payment that had already moved. And the receipt write swallowed its own failure,
 * so a settled payment could vanish from reconciliation while the response still said success.
 *
 * The obligation is now recorded *before* delivery, and the write reports whether it happened.
 *
 * Delivery is failed two ways, both deliberately independent of the module-level dataset LRU (which
 * is shared across a test file, so an R2 fault would only be seen on a cold cache): the address
 * database throws, and the province has no address coverage.
 */

const SECRET = 'test-offer-secret';
const RIDING = 'Spadina—Harbourfront';
const DATASET_ID = 'federalridings-2024.geojson';

function row(id: number): OdaMemoryAddressRow {
  return {
    id,
    province: 'ON',
    civic_number: String(id),
    street_name: `STREET${id}`,
    street_type: 'ST',
    street_direction: '',
    unit: '',
    postal_code: 'M5V 2T6',
    city: 'Toronto',
    city_key: 'TORONTO|ON',
    lat: TORONTO_LAT + ((id % 10) - 5) * 0.001,
    lon: TORONTO_LON + ((id % 7) - 3) * 0.001,
    full_address: `${id} Street${id}`,
    search_key: `${id}|STREET${id}|ST||TORONTO|ON`,
    street_key: `STREET${id}|ST||TORONTO|ON`,
  };
}

interface Options {
  /** Reject every receipt write, as an unavailable KV would. */
  failWrites?: boolean;
  /** Make the address database throw, so delivery fails after settlement. */
  dbThrows?: boolean;
  /** Give the offer's province no address coverage, so delivery returns a non-OK response. */
  noCoverage?: boolean;
}

function envFor(options: Options = {}) {
  const { sqlite } = createOdaSqlite();
  seedOdaRows(sqlite, { addresses: Array.from({ length: 300 }, (_, i) => row(i + 1)) });
  const base = createLookupTestEnv();
  const store = new Map<string, string>();

  return {
    store,
    env: {
      ...base,
      PUBLIC_API_HOSTS: 'lookup.test',
      OFFER_SIGNING_SECRET: SECRET,
      ODA_DB: options.dbThrows
        ? { prepare: () => { throw new Error('D1 unavailable'); } }
        : createD1Shim(sqlite),
      ...(options.noCoverage ? { ODA_PROVINCES: 'QC' } : {}),
      X402_ENABLED: 'true',
      X402_PAY_TO: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
      X402_NETWORK: 'eip155:84532',
      X402_ASSET: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      X402_FACILITATOR_URL: 'https://facilitator.test',
      X402_RECEIPTS: {
        get: async (key: string, type?: string) => {
          const value = store.get(key);
          if (value === undefined) return null;
          return type === 'json' ? JSON.parse(value) : value;
        },
        put: async (key: string, value: string) => {
          if (options.failWrites) throw new Error('KV write rejected');
          // KV limits a key to 512 bytes. Correct fake behaviour; note the unit test in
          // x402-receipts.test.ts is the real guard, because these fixtures happen to produce offer
          // ids short enough to stay under the limit.
          if (new TextEncoder().encode(key).length > 512) throw new Error('KV key too long');
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
      } as unknown as KVNamespace,
      API_KEY_USAGE: fakeUsageNamespace(),
    } as unknown as Env,
  };
}

const paymentSignature = () =>
  btoa(
    JSON.stringify({
      x402Version: 2,
      payload: {
        signature: '0xdeadbeef',
        authorization: { from: '0x857b06519E91e3A54538791bDbb0E22373e36b66' },
      },
    })
  );

function stubFacilitator() {
  const spy = vi.fn(async (url: string | URL) => {
    const target = String(url);
    if (target.endsWith('/verify')) return new Response(JSON.stringify({ isValid: true }), { status: 200 });
    if (target.endsWith('/settle')) {
      return new Response(
        JSON.stringify({ success: true, transaction: '0xsettled', network: 'eip155:84532' }),
        { status: 200 }
      );
    }
    throw new Error(`unexpected facilitator call: ${target}`);
  }) as typeof fetch;
  globalThis.fetch = spy;
  return spy as unknown as ReturnType<typeof vi.fn>;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function accept(env: Env, maximumResults = 250) {
  const offer = await createAreaOffer(SECRET, {
    riding: RIDING,
    datasetId: DATASET_ID,
    datasetYear: 2024,
    maximumResults,
  });
  return fetchLookup(env, `/api/quote/accept?offer=${encodeURIComponent(offer.offerId)}`, {
    method: 'POST',
    headers: { [PAYMENT_SIGNATURE_HEADER]: paymentSignature() },
  });
}

const errorLog = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((call) => String(call[0])).join('\n');

describe('a settled payment survives a delivery failure (#129)', () => {
  it('records the obligation when delivery throws', async () => {
    const { env } = envFor({ dbThrows: true });
    stubFacilitator();

    const response = await accept(env);

    expect(response.status).toBe(502);
    expect(((await response.json()) as { code?: string }).code).toBe('SETTLEMENT_DELIVERY_FAILED');

    // The payment moved, so there is a receipt — recorded before delivery was attempted.
    const receipts = await listReceipts(env);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].delivered).toBe(false);
    expect(receipts[0].payer).toBe('0x857b06519E91e3A54538791bDbb0E22373e36b66');
    // The settlement identity is preserved, which is what a refund needs.
    expect(receipts[0].settlement.transaction).toBe('0xsettled');

    // And reconciliation reports it as an obligation rather than a success.
    const summary = reconciliationSummary(receipts);
    expect(summary.deliveryFailed).toBe(1);
    expect(summary.settledValue.USD).toBeGreaterThan(0);
  });

  it('records the obligation when delivery returns a non-OK response', async () => {
    const { env } = envFor({ noCoverage: true });
    stubFacilitator();

    const response = await accept(env);

    expect(response.status).toBe(502);
    const receipts = await listReceipts(env);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].delivered).toBe(false);
    expect(receipts[0].settlement.transaction).toBe('0xsettled');
  });

  it('corrects the record once delivery succeeds, keeping one obligation', async () => {
    const { env } = envFor();
    stubFacilitator();

    const response = await accept(env);
    expect(response.status).toBe(200);

    // One receipt, updated in place — not a second record.
    const receipts = await listReceipts(env);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].delivered).toBe(true);
    expect(receipts[0].resultCount).toBeGreaterThan(0);
    expect((await response.json() as { receiptPersisted: boolean }).receiptPersisted).toBe(true);
  });
});

describe('an unrecordable receipt is not reported as success (#129)', () => {
  it('says so when the store rejects the write, and still delivers what was paid for', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { env } = envFor({ failWrites: true });
    stubFacilitator();

    const response = await accept(env);
    const body = (await response.json()) as {
      receiptPersisted: boolean;
      receipt: { offerId: string; delivered: boolean };
      result: { records: unknown[] };
    };

    // The payer is not punished for our storage failure: the result is delivered.
    expect(response.status).toBe(200);
    expect(body.result.records.length).toBeGreaterThan(0);
    // But success is not claimed for the record.
    expect(body.receiptPersisted).toBe(false);

    // The whole receipt goes to the log, so the settlement can be recovered from the transaction.
    const logged = errorLog(errorSpy);
    expect(logged).toContain('RECEIPT NOT PERSISTED');
    expect(logged).toContain('0xsettled');
    expect(logged).toContain(body.receipt.offerId);
  });

  it('logs the obligation when delivery also failed and the store is down', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { env } = envFor({ failWrites: true, noCoverage: true });
    stubFacilitator();

    const response = await accept(env);

    expect(response.status).toBe(502);
    // Nothing durable holds it, so the log is the only recovery path — and it carries the identity.
    expect(errorLog(errorSpy)).toContain('0xsettled');
  });
});
