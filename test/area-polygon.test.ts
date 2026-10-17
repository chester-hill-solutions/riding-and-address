import { describe, it, expect, vi, afterEach } from 'vitest';
import { geometryHash } from '../src/area-geometry';
import { createD1Shim, createOdaSqlite, seedOdaRows } from './helpers/oda-sqlite';
import { createLookupTestEnv, fetchLookup } from './helpers/lookup-test-env';
import type { OdaMemoryAddressRow } from './helpers/oda-memory-db';
import { PAYMENT_SIGNATURE_HEADER } from '../src/x402';
import type { Env } from '../src/types';

/**
 * W9: a caller-supplied shape. The shape cannot travel in an offer or a cursor — it is tens of
 * kilobytes — so the offer and cursor carry its hash and the client resends the boundary, which is
 * checked against that hash. These tests are mostly about that check.
 */

const SECRET = 'test-offer-secret';

/** A small square well inside the federal fixture's polygon, and inside the 2-degree span cap. */
const BOUNDARY = {
  type: 'Polygon',
  coordinates: [
    [
      [-79.40, 43.60],
      [-79.30, 43.60],
      [-79.30, 43.70],
      [-79.40, 43.70],
      [-79.40, 43.60],
    ],
  ],
};

const OTHER_BOUNDARY = {
  type: 'Polygon',
  coordinates: [
    [
      [-79.41, 43.61],
      [-79.31, 43.61],
      [-79.31, 43.71],
      [-79.41, 43.71],
      [-79.41, 43.61],
    ],
  ],
};

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
    // Spread across the square.
    lat: 43.65 + ((id % 5) - 2) * 0.001,
    lon: -79.35 + ((id % 3) - 1) * 0.001,
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

/** 260 rows, so a 1,000-record offer genuinely pages. */
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
  } as unknown as Env;
}

const paymentSignature = () =>
  btoa(JSON.stringify({ x402Version: 2, payload: { signature: '0xdeadbeef' } }));

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFacilitator(): void {
  globalThis.fetch = vi.fn(async (url: string | URL) => {
    const target = String(url);
    if (target.endsWith('/verify')) return new Response(JSON.stringify({ isValid: true }), { status: 200 });
    if (target.endsWith('/settle')) {
      return new Response(JSON.stringify({ success: true, transaction: '0xabc', network: 'eip155:84532' }), {
        status: 200,
      });
    }
    throw new Error(`unexpected facilitator call: ${target}`);
  }) as typeof fetch;
}

async function quote(env: Env, body: Record<string, unknown>) {
  const response = await fetchLookup(env, '/api/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'area.search', province: 'ON', ...body }),
  });
  return response;
}

describe('POST /api/quote for a caller-supplied boundary', () => {
  it('quotes the shape by hash, not by value', async () => {
    const response = await quote(envWithRows(3), { boundary: BOUNDARY, maximum_results: 500 });
    expect(response.status).toBe(200);

    const offer = (await response.json()) as {
      operation: string;
      scope: { geometryHash: string; province: string };
      price: { maximum: number };
    };
    expect(offer.operation).toBe('area.search');
    expect(offer.scope.geometryHash).toBe(await geometryHash(BOUNDARY));
    expect(offer.scope.province).toBe('ON');
    // 500 records is two whole units.
    expect(offer.price.maximum).toBe(4);
    // The shape itself is nowhere in the offer.
    expect(JSON.stringify(offer)).not.toContain('coordinates');
  });

  it('refuses an unusable shape before an offer exists', async () => {
    const response = await quote(envWithRows(3), {
      boundary: { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0]]] },
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code?: string }).code).toBe('INVALID_SHAPE');
  });

  it('requires a province, since polygon queries are province-scoped in v1', async () => {
    const response = await fetchLookup(envWithRows(3), '/api/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'area.search', boundary: BOUNDARY }),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code?: string }).code).toBe('INVALID_QUERY');
  });

  it('refuses a province with no imported addresses', async () => {
    const response = await fetchLookup(envWithRows(3), '/api/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'area.search', province: 'NU', boundary: BOUNDARY }),
    });
    expect(response.status).toBe(404);
    expect(((await response.json()) as { code?: string }).code).toBe('NO_ADDRESS_COVERAGE');
  });
});

describe('a polygon area search through the paid path', () => {
  it('settles, delivers page one, and the cursor it mints serves page two', async () => {
    const env = envWithRows();
    stubFacilitator();

    const quoted = await quote(env, { boundary: BOUNDARY, maximum_results: 1000 });
    const offer = (await quoted.json()) as { offerId: string };

    const accepted = await fetchLookup(env, `/api/quote/accept?offer=${encodeURIComponent(offer.offerId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [PAYMENT_SIGNATURE_HEADER]: paymentSignature() },
      body: JSON.stringify({ boundary: BOUNDARY }),
    });
    expect(accepted.status).toBe(200);

    const first = (await accepted.json()) as {
      receipt: { scope: { geometryHash?: string } };
      result: {
        boundary: { geometryHash: string; province: string };
        records: Array<{ id: number }>;
        page: { cursor: string | null; hasMore: boolean };
      };
    };
    expect(first.result.records).toHaveLength(250);
    expect(first.result.page.hasMore).toBe(true);
    expect(first.result.boundary.geometryHash).toBe(await geometryHash(BOUNDARY));
    expect(first.receipt.scope.geometryHash).toBe(await geometryHash(BOUNDARY));

    // Page two: the boundary travels in the body and is checked against the cursor's hash.
    const second = await fetchLookup(env, '/api/area', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cursor: first.result.page.cursor, boundary: BOUNDARY }),
    });
    expect(second.status).toBe(200);
    const next = (await second.json()) as { records: Array<{ id: number }>; page: { hasMore: boolean } };
    expect(next.records).toHaveLength(10);
    expect(next.page.hasMore).toBe(false);

    const ids = new Set([...first.result.records, ...next.records].map((r) => r.id));
    expect(ids.size).toBe(260);
  });

  it('refuses a boundary that is not the one the offer bound', async () => {
    const env = envWithRows();
    stubFacilitator();

    const quoted = await quote(env, { boundary: BOUNDARY, maximum_results: 1000 });
    const offer = (await quoted.json()) as { offerId: string };

    const accepted = await fetchLookup(env, `/api/quote/accept?offer=${encodeURIComponent(offer.offerId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [PAYMENT_SIGNATURE_HEADER]: paymentSignature() },
      body: JSON.stringify({ boundary: OTHER_BOUNDARY }),
    });
    expect(accepted.status).toBe(400);
    expect(((await accepted.json()) as { code?: string }).code).toBe('INVALID_SHAPE');
  });

  it('refuses a page whose boundary does not match the cursor', async () => {
    const env = envWithRows();
    stubFacilitator();

    const quoted = await quote(env, { boundary: BOUNDARY, maximum_results: 1000 });
    const offer = (await quoted.json()) as { offerId: string };
    const accepted = await fetchLookup(env, `/api/quote/accept?offer=${encodeURIComponent(offer.offerId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [PAYMENT_SIGNATURE_HEADER]: paymentSignature() },
      body: JSON.stringify({ boundary: BOUNDARY }),
    });
    const first = (await accepted.json()) as { result: { page: { cursor: string } } };

    const swapped = await fetchLookup(env, '/api/area', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cursor: first.result.page.cursor, boundary: OTHER_BOUNDARY }),
    });
    expect(swapped.status).toBe(400);
    expect(((await swapped.json()) as { code?: string }).code).toBe('INVALID_SHAPE');
  });
});
