import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAreaOffer } from '../src/offers';
import { AREA_SCAN_BUDGET, readAreaPage } from '../src/area-query';
import { getAddressStore } from '../src/address-store';
import { createD1Shim, createOdaSqlite, seedOdaRows } from './helpers/oda-sqlite';
import { fakeUsageNamespace } from './helpers/fake-usage-do';
import { createLookupTestEnv, fetchLookup, TORONTO_LAT, TORONTO_LON } from './helpers/lookup-test-env';
import type { OdaMemoryAddressRow } from './helpers/oda-memory-db';
import { createMemoryKv } from './helpers/memory-kv';
import { PAYMENT_SIGNATURE_HEADER } from '../src/x402';
import type { Env } from '../src/types';

/**
 * #142: the paid ceiling must hold *across* pages, not just on page one.
 *
 * The offer bound `maximumResults`, but the cursor carried no allowance, so every continuation read
 * its own full page: a 300-record offer could deliver 250 + 250 + …. The allowance now travels in the
 * signed cursor and is decremented by the records actually returned.
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
    lat: TORONTO_LAT + ((id % 10) - 5) * 0.001,
    lon: TORONTO_LON + ((id % 7) - 3) * 0.001,
    full_address: `${id} Street${id}`,
    search_key: `${id}|STREET${id}|ST||TORONTO|ON`,
    street_key: `STREET${id}|ST||TORONTO|ON`,
  };
}


function envWithRows(count: number): Env {
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
    X402_RECEIPTS: createMemoryKv(),
    API_KEY_USAGE: fakeUsageNamespace(),
  } as unknown as Env;
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

/** Stub the facilitator, and hand back the spy so a test can count money-moving calls. */
function stubFacilitator() {
  const spy = vi.fn(async (url: string | URL) => {
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
  globalThis.fetch = spy;
  return spy as unknown as ReturnType<typeof vi.fn>;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface Page {
  records: Array<{ id: number }>;
  page: { cursor: string | null; hasMore: boolean; truncated: boolean };
}

/** Accept an offer for `maximumResults` and page until the cursor runs out. */
async function acceptAndPage(env: Env, maximumResults: number, maxPages = 12): Promise<Page[]> {
  const offer = await createAreaOffer(SECRET, {
    riding: RIDING,
    datasetId: DATASET_ID,
    datasetYear: 2024,
    maximumResults,
  });

  const accepted = await fetchLookup(env, `/api/quote/accept?offer=${encodeURIComponent(offer.offerId)}`, {
    method: 'POST',
    headers: { [PAYMENT_SIGNATURE_HEADER]: paymentSignature() },
  });
  expect(accepted.status).toBe(200);
  const body = (await accepted.json()) as { result: Page };
  const pages: Page[] = [body.result];

  let cursor = body.result.page.cursor;
  while (cursor && pages.length < maxPages) {
    const next = await fetchLookup(env, `/api/area?cursor=${encodeURIComponent(cursor)}`);
    expect(next.status).toBe(200);
    const parsed = (await next.json()) as Page;
    pages.push(parsed);
    cursor = parsed.page.cursor;
  }
  return pages;
}

const delivered = (pages: Page[]) => pages.reduce((sum, page) => sum + page.records.length, 0);

/** Rewrite the cursor's allowance while keeping its original signature. */
function tamperRemaining(token: string, remaining: number): string {
  const [body, signature] = token.split('.');
  const decoded = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
  decoded.remaining = remaining;
  const forged = btoa(JSON.stringify(decoded)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${forged}.${signature}`;
}

describe('the paid ceiling holds across pages (#142)', () => {
  it('delivers exactly the ceiling when the data exceeds it, then stops', async () => {
    // 600 matches against a 300-record offer: 250 then 50, and no third page.
    stubFacilitator();
    const pages = await acceptAndPage(envWithRows(600), 300);

    expect(pages.map((page) => page.records.length)).toEqual([250, 50]);
    expect(delivered(pages)).toBe(300);
    // The ceiling was reached and more data exists, so the buyer is told the result was cut short.
    expect(pages[1].page.truncated).toBe(true);
    expect(pages[1].page.hasMore).toBe(false);
    expect(pages[1].page.cursor).toBeNull();
  });

  it('never exceeds a 1,000-record ceiling however many pages it takes', async () => {
    stubFacilitator();
    const pages = await acceptAndPage(envWithRows(1200), 1000);

    expect(delivered(pages)).toBe(1000);
    expect(pages.map((page) => page.records.length)).toEqual([250, 250, 250, 250]);
    expect(pages[pages.length - 1].page.truncated).toBe(true);
    expect(pages[pages.length - 1].page.cursor).toBeNull();
  });

  it('completes without truncation when the dataset runs out below the ceiling', async () => {
    stubFacilitator();
    const pages = await acceptAndPage(envWithRows(260), 1000);

    expect(pages.map((page) => page.records.length)).toEqual([250, 10]);
    // Nothing was cut short: the data ended, not the allowance.
    expect(pages[1].page.truncated).toBe(false);
    expect(pages[1].page.cursor).toBeNull();
  });

  it('rejects a cursor whose allowance was tampered with', async () => {
    const env = envWithRows(600);
    stubFacilitator();
    const pages = await acceptAndPage(env, 300);
    const cursor = pages[0].page.cursor as string;
    expect(cursor).toBeTruthy();

    // Inflating the allowance would defeat the ceiling, so it has to be inside the signature.
    const response = await fetchLookup(
      env,
      `/api/area?cursor=${encodeURIComponent(tamperRemaining(cursor, 10_000))}`
    );
    expect(response.status).toBe(410);
    expect(((await response.json()) as { code?: string }).code).toBe('CURSOR_INVALID');
  });

  it('pages without settling again, so one charge covers every page', async () => {
    const env = envWithRows(600);
    const spy = stubFacilitator();
    await acceptAndPage(env, 300);

    // One /verify and one /settle for the whole paged read.
    expect(spy.mock.calls.filter((call) => String(call[0]).endsWith('/settle')).length).toBe(1);
    expect(spy.mock.calls.filter((call) => String(call[0]).endsWith('/verify')).length).toBe(1);
  });
});

describe('the scan budget produces the shape the allowance arithmetic must handle', () => {
  /**
   * A budget-limited page returns fewer records than asked for *and* has more to give. The handler
   * cannot tell that apart from a short page caused by the data running out, and must not: in both
   * cases the unused allowance carries over. This pins the shape itself, since reaching the real
   * budget (10,000 candidates) through the route would need a fixture larger than the test warrants.
   */
  it('returns a short page that still has more, with the budget marked exhausted', async () => {
    const env = envWithRows(600);
    const page = await readAreaPage({
      store: getAddressStore(env.ODA_DB as never, () => {}),
      province: 'ON',
      boundary: {
        type: 'Polygon',
        coordinates: [[[-79.5, 43.5], [-79.2, 43.5], [-79.2, 43.8], [-79.5, 43.8], [-79.5, 43.5]]],
      },
      pageSize: 250,
      scanBudget: 5,
    });

    expect(page.records.length).toBeLessThan(250);
    expect(page.budgetExhausted).toBe(true);
    expect(page.hasMore).toBe(true);
    expect(page.scanned).toBeLessThanOrEqual(5);
    // The real budget is the one the route uses; this is only a smaller one to force the shape.
    expect(AREA_SCAN_BUDGET).toBeGreaterThan(5);
  });
});
