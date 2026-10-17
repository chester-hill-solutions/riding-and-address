import { describe, it, expect } from 'vitest';
import {
  AREA_MAX_RESULTS,
  AREA_UNIT_PRICE_USD,
  AREA_UNIT_RECORDS,
  areaPriceUsd,
  createAreaOffer,
  signAreaPageCursor,
  verifyAreaPageCursor,
  verifyOffer,
  type AreaPageCursor,
} from '../src/offers';
import { createLookupTestEnv, fetchLookup } from './helpers/lookup-test-env';
import type { Env } from '../src/types';

/**
 * The area offer and its page cursor. Two things matter: the price ceiling is a whole number of
 * 250-record units (so the page count can never change what a buyer pays), and the cursor is
 * unforgeable — it is the only authorization to read a second page.
 */

const SECRET = 'test-offer-secret';
const RIDING = 'Spadina—Harbourfront';

const env = (overrides: Partial<Env> = {}): Env =>
  ({
    ...createLookupTestEnv(),
    PUBLIC_API_HOSTS: 'lookup.test',
    OFFER_SIGNING_SECRET: SECRET,
    ...overrides,
  }) as unknown as Env;

const CURSOR: AreaPageCursor = {
  id: 42,
  scope: { riding: RIDING, datasetId: 'federalridings-2024.geojson', datasetYear: 2024 },
  offerId: 'offer-1',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

describe('areaPriceUsd', () => {
  it('charges whole 250-record units, rounded up', () => {
    expect(areaPriceUsd(1)).toBe(AREA_UNIT_PRICE_USD);
    expect(areaPriceUsd(AREA_UNIT_RECORDS)).toBe(AREA_UNIT_PRICE_USD);
    expect(areaPriceUsd(AREA_UNIT_RECORDS + 1)).toBe(AREA_UNIT_PRICE_USD * 2);
    expect(areaPriceUsd(AREA_MAX_RESULTS)).toBe(AREA_UNIT_PRICE_USD * (AREA_MAX_RESULTS / AREA_UNIT_RECORDS));
  });
});

describe('createAreaOffer', () => {
  it('binds the riding, vintage, maximum and a whole-unit price ceiling', async () => {
    const now = Date.now();
    const offer = await createAreaOffer(SECRET, {
      riding: RIDING,
      datasetId: 'federalridings-2024.geojson',
      datasetYear: 2024,
      maximumResults: 600,
      nowMs: now,
    });

    expect(offer.operation).toBe('area.search');
    expect(offer.scope).toEqual({
      riding: RIDING,
      datasetId: 'federalridings-2024.geojson',
      datasetYear: 2024,
    });
    expect(offer.limits.maximumResults).toBe(600);
    // 600 records is three units, whatever the page count turns out to be.
    expect(offer.price.maximum).toBe(AREA_UNIT_PRICE_USD * 3);
    expect(offer.paymentMethods).toEqual([]);
    expect(await verifyOffer(SECRET, offer.offerId)).toMatchObject({ operation: 'area.search' });
  });

  it('labels an unknown count as an estimate', async () => {
    const withoutTotal = await createAreaOffer(SECRET, {
      riding: RIDING,
      datasetId: 'd',
      datasetYear: 2024,
      maximumResults: 250,
    });
    expect(withoutTotal.estimate).toEqual({ resultCount: null, exact: false });

    const withTotal = await createAreaOffer(SECRET, {
      riding: RIDING,
      datasetId: 'd',
      datasetYear: 2024,
      maximumResults: 250,
      total: 180,
    });
    expect(withTotal.estimate).toEqual({ resultCount: 180, exact: true });
  });
});

describe('area page cursors', () => {
  it('round-trip', async () => {
    const token = await signAreaPageCursor(SECRET, CURSOR);
    expect(await verifyAreaPageCursor(SECRET, token)).toEqual(CURSOR);
  });

  it('reject a token signed with another secret', async () => {
    const token = await signAreaPageCursor('other', CURSOR);
    expect(await verifyAreaPageCursor(SECRET, token)).toBeNull();
  });

  it('reject a tampered payload', async () => {
    const token = await signAreaPageCursor(SECRET, CURSOR);
    const [, signature] = token.split('.');
    const forged = btoa(JSON.stringify({ ...CURSOR, id: 0, scope: { geometryHash: 'sha256:x', province: 'ON' } }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(await verifyAreaPageCursor(SECRET, `${forged}.${signature}`)).toBeNull();
  });

  it('reject an expired cursor', async () => {
    const token = await signAreaPageCursor(SECRET, {
      ...CURSOR,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(await verifyAreaPageCursor(SECRET, token)).toBeNull();
  });

  it('reject a malformed token', async () => {
    expect(await verifyAreaPageCursor(SECRET, 'nope')).toBeNull();
    expect(await verifyAreaPageCursor(SECRET, 'a.b.c')).toBeNull();
  });
});

describe('GET /api/quote?operation=area.search', () => {
  it('quotes a riding with a whole-unit ceiling', async () => {
    const response = await fetchLookup(
      env(),
      `/api/quote?operation=area.search&riding=${encodeURIComponent(RIDING)}&maximum_results=300`
    );
    expect(response.status).toBe(200);
    const offer = (await response.json()) as { operation: string; price: { maximum: number }; limits: { maximumResults: number } };
    expect(offer.operation).toBe('area.search');
    expect(offer.limits.maximumResults).toBe(300);
    expect(offer.price.maximum).toBe(AREA_UNIT_PRICE_USD * 2);
  });

  it('requires a riding', async () => {
    const response = await fetchLookup(env(), '/api/quote?operation=area.search');
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code?: string }).code).toBe('INVALID_QUERY');
  });

  it('refuses a maximum above the v1 limit', async () => {
    const response = await fetchLookup(
      env(),
      `/api/quote?operation=area.search&riding=${encodeURIComponent(RIDING)}&maximum_results=${AREA_MAX_RESULTS + 1}`
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code?: string }).code).toBe('LIMIT_EXCEEDED');
  });

  it('refuses an unknown dataset', async () => {
    const response = await fetchLookup(env(), `/api/quote?operation=area.search&riding=x&dataset=zz`);
    expect(response.status).toBe(404);
    expect(((await response.json()) as { code?: string }).code).toBe('DATASET_UNAVAILABLE');
  });

  it('refuses a riding that is not in the dataset', async () => {
    const response = await fetchLookup(env(), '/api/quote?operation=area.search&riding=Nowhere');
    expect(response.status).toBe(404);
    expect(((await response.json()) as { code?: string }).code).toBe('RIDING_NOT_FOUND');
  });

  it('still quotes a point lookup by default', async () => {
    const response = await fetchLookup(env(), '/api/quote?postal=K1A0A6');
    expect(response.status).toBe(200);
    expect(((await response.json()) as { operation: string }).operation).toBe('lookup.point');
  });

  it('rejects an unknown operation', async () => {
    const response = await fetchLookup(env(), '/api/quote?operation=something.else');
    expect(response.status).toBe(400);
  });
});
