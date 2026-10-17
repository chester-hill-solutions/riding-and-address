import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAreaOffer } from '../src/offers';
import { createD1Shim, createOdaSqlite, seedOdaRows } from './helpers/oda-sqlite';
import { fakeUsageNamespace } from './helpers/fake-usage-do';
import { createLookupTestEnv, fetchLookup, TORONTO_LAT, TORONTO_LON } from './helpers/lookup-test-env';
import type { OdaMemoryAddressRow } from './helpers/oda-memory-db';
import { PAYMENT_SIGNATURE_HEADER } from '../src/x402';
import type { Env } from '../src/types';

/**
 * W8's last gap: page one delivered through the *paid* path, then page two through the cursor it
 * mints. This is the only test that exercises the whole chain — offer → x402 accept → settle →
 * deliver → cursor → next page — so it is the one that proves the two halves fit together.
 */

const SECRET = 'test-offer-secret';
const RIDING = 'Spadina—Harbourfront';
const DATASET_ID = 'federalridings-2024.geojson';

/** The federal fixture polygon is roughly lon [-79.5,-79.2], lat [43.5,43.8]. */
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
    // Spread the rows a little so they are distinct, but all inside the polygon.
    lat: TORONTO_LAT + ((id % 10) - 5) * 0.001,
    lon: TORONTO_LON + ((id % 7) - 3) * 0.001,
    full_address: `${id} Street${id}`,
    search_key: `${id}|STREET${id}|ST||TORONTO|ON`,
    street_key: `STREET${id}|ST||TORONTO|ON`,
  };
}

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
      keys: [...store.keys()].filter((name) => !prefix || name.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true,
      cacheStatus: null,
    }),
  } as unknown as KVNamespace;
}

/** 260 rows: more than one 250-record page, so paging is genuinely exercised. */
function envWithRows(count = 260): Env {
  const { sqlite } = createOdaSqlite();
  seedOdaRows(sqlite, { addresses: Array.from({ length: count }, (_, i) => row(i + 1)) });
  return {
    ...createLookupTestEnv(),
    PUBLIC_API_HOSTS: 'lookup.test',
    OFFER_SIGNING_SECRET: SECRET,
    ODA_DB: createD1Shim(sqlite),
    X402_ENABLED: 'true',
    X402_PAY_TO: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
    X402_NETWORK: 'eip155:84532',
    X402_ASSET: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    X402_FACILITATOR_URL: 'https://facilitator.test',
    X402_RECEIPTS: fakeKv(),
    // The spend cap fails closed, so the paid path needs the counter bound.
    API_KEY_USAGE: fakeUsageNamespace(),
  } as unknown as Env;
}

// Names its payer: with the spend cap enabled an unnameable payment is refused before settlement.
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

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFacilitator(): void {
  globalThis.fetch = vi.fn(async (url: string | URL) => {
    const target = String(url);
    if (target.endsWith('/verify')) {
      return new Response(JSON.stringify({ isValid: true }), { status: 200 });
    }
    if (target.endsWith('/settle')) {
      return new Response(
        JSON.stringify({ success: true, transaction: '0xabc', network: 'eip155:84532' }),
        { status: 200 }
      );
    }
    throw new Error(`unexpected facilitator call: ${target}`);
  }) as typeof fetch;
}

describe('area search through the paid path', () => {
  it('settles, delivers page one, and the cursor it mints serves page two', async () => {
    const env = envWithRows();
    stubFacilitator();

    const offer = await createAreaOffer(SECRET, {
      riding: RIDING,
      datasetId: DATASET_ID,
      datasetYear: 2024,
      maximumResults: 1000,
    });

    const accepted = await fetchLookup(env, `/api/quote/accept?offer=${encodeURIComponent(offer.offerId)}`, {
      method: 'POST',
      headers: { [PAYMENT_SIGNATURE_HEADER]: paymentSignature() },
    });
    expect(accepted.status).toBe(200);

    const first = (await accepted.json()) as {
      receipt: { operation: string; resultCount: number; delivered: boolean };
      result: {
        records: Array<{ id: number }>;
        page: { cursor: string | null; hasMore: boolean; truncated: boolean };
        count: { returned: number; total: number | null; exact: boolean };
        attribution: string[];
      };
    };

    // A whole unit of records, with the ceiling nowhere near reached.
    expect(first.result.records).toHaveLength(250);
    expect(first.result.page.hasMore).toBe(true);
    expect(first.result.page.truncated).toBe(false);
    expect(first.result.page.cursor).toBeTruthy();
    // The count was never computed, so it is labelled an estimate rather than an exact zero.
    expect(first.result.count).toEqual({ returned: 250, total: null, exact: false });
    expect(first.result.attribution.length).toBeGreaterThan(0);

    expect(first.receipt.operation).toBe('area.search');
    expect(first.receipt.resultCount).toBe(250);
    expect(first.receipt.delivered).toBe(true);

    // Page two, authorized only by the cursor the paid call minted.
    const second = await fetchLookup(
      env,
      `/api/area?cursor=${encodeURIComponent(first.result.page.cursor as string)}`
    );
    expect(second.status).toBe(200);
    const next = (await second.json()) as {
      records: Array<{ id: number }>;
      page: { hasMore: boolean; cursor: string | null };
    };
    expect(next.records).toHaveLength(10);
    expect(next.page.hasMore).toBe(false);
    expect(next.page.cursor).toBeNull();

    // No record appears in both pages, and none is skipped.
    const firstIds = first.result.records.map((r) => r.id);
    const nextIds = next.records.map((r) => r.id);
    expect(new Set([...firstIds, ...nextIds]).size).toBe(260);
  });

  it('stops at the paid ceiling instead of delivering more than was bought', async () => {
    const env = envWithRows();
    stubFacilitator();

    // A 250-record offer against 260 rows: the buyer gets exactly what they paid for and is told
    // the result was cut short, rather than being handed 260 records for the price of 250.
    const offer = await createAreaOffer(SECRET, {
      riding: RIDING,
      datasetId: DATASET_ID,
      datasetYear: 2024,
      maximumResults: 250,
    });

    const accepted = await fetchLookup(env, `/api/quote/accept?offer=${encodeURIComponent(offer.offerId)}`, {
      method: 'POST',
      headers: { [PAYMENT_SIGNATURE_HEADER]: paymentSignature() },
    });
    expect(accepted.status).toBe(200);

    const body = (await accepted.json()) as {
      result: { records: unknown[]; page: { cursor: string | null; truncated: boolean } };
    };
    expect(body.result.records).toHaveLength(250);
    expect(body.result.page.truncated).toBe(true);
    expect(body.result.page.cursor).toBeNull();
  });
});
