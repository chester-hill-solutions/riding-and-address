import { describe, it, expect } from 'vitest';
import {
  createOffer,
  handleQuoteRequest,
  signOffer,
  verifyOffer,
  OFFER_TTL_MS,
  type LookupOfferPayload,
  type OfferPayload,
} from '../src/offers';
import { createRouteContext, type RouteContext } from '../src/route-context';
import { UPLOAD_ROW_PRICE_USD } from '../src/upload-sheet';
import type { Env } from '../src/types';

/**
 * W5: a quote is free, expiring, and bound to the operation, inputs, dataset vintage and price
 * ceiling. It is signed so acceptance (W6) can verify all of that without any storage — and it must
 * never touch the usage ledger.
 */

const SECRET = 'test-offer-secret';

const MOCK_CTX = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;

function quoteContext(path: string, env: Partial<Env> = { OFFER_SIGNING_SECRET: SECRET }): RouteContext {
  const request = new Request(`https://lookup.test${path}`);
  return createRouteContext({
    request,
    env: { RIDINGS: {} as R2Bucket, ...env } as Env,
    ctx: MOCK_CTX,
    correlationId: 'test-correlation',
    startTime: Date.now(),
  });
}

const PAYLOAD: OfferPayload = {
  operation: 'lookup.point',
  scope: { inputs: { postal: 'K1A 0A6' }, datasetId: 'federalridings-2024.geojson', datasetYear: 2024 },
  estimate: { resultCount: 1, exact: true },
  price: { currency: 'USD', maximum: 0.005 },
  limits: { maximumResults: 1, expiresAt: new Date(Date.now() + 60_000).toISOString() },
  paymentMethods: [],
};

describe('offer signing', () => {
  it('round-trips a payload through sign and verify', async () => {
    const token = await signOffer(SECRET, PAYLOAD);
    expect(await verifyOffer(SECRET, token)).toEqual(PAYLOAD);
  });

  it('rejects a payload signed with a different secret', async () => {
    const token = await signOffer('other-secret', PAYLOAD);
    expect(await verifyOffer(SECRET, token)).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await signOffer(SECRET, PAYLOAD);
    const [body, signature] = token.split('.');
    const tampered = { ...PAYLOAD, price: { currency: 'USD', maximum: 0 } };
    const forgedBody = btoa(JSON.stringify(tampered)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await verifyOffer(SECRET, `${forgedBody}.${signature}`)).toBeNull();
    expect(body).toBeTruthy();
  });

  it('rejects an expired offer', async () => {
    const expired: OfferPayload = {
      ...PAYLOAD,
      limits: { maximumResults: 1, expiresAt: new Date(Date.now() - 1000).toISOString() },
    };
    const token = await signOffer(SECRET, expired);
    expect(await verifyOffer(SECRET, token)).toBeNull();
  });

  it('rejects a malformed token', async () => {
    expect(await verifyOffer(SECRET, 'not-a-token')).toBeNull();
    expect(await verifyOffer(SECRET, 'a.b.c')).toBeNull();
  });
});

describe('createOffer', () => {
  it('binds the operation, inputs, dataset vintage, price ceiling and an expiry', async () => {
    const now = Date.now();
    const offer = await createOffer(SECRET, {
      lookupPathname: '/api/on',
      query: { postal: 'M5V 2T6' },
      nowMs: now,
    });

    expect(offer.operation).toBe('lookup.point');
    const lookup = offer as LookupOfferPayload;
    expect(lookup.scope.inputs).toEqual({ postal: 'M5V 2T6' });
    expect(lookup.scope.datasetId).toBe('ontarioridings-2022.geojson');
    expect(lookup.scope.datasetYear).toBe(2022);
    expect(offer.price.maximum).toBe(UPLOAD_ROW_PRICE_USD);
    expect(Date.parse(offer.limits.expiresAt)).toBe(now + OFFER_TTL_MS);
    // No payment method is advertised until W6 can honour one.
    expect(offer.paymentMethods).toEqual([]);
    expect(await verifyOffer(SECRET, offer.offerId)).toMatchObject({ scope: offer.scope });
  });
});

describe('GET /api/quote', () => {
  it('returns a signed, verifiable offer and is never billed', async () => {
    const response = await handleQuoteRequest(quoteContext('/api/quote?postal=K1A0A6'));
    expect(response.status).toBe(200);

    const body = (await response.json()) as LookupOfferPayload & { offerId: string };
    expect(body.price.maximum).toBe(UPLOAD_ROW_PRICE_USD);
    expect(body.scope.datasetYear).toBe(2024);
    expect(body.offerId).toBeTruthy();
    // The token the caller hands back must verify against the same secret.
    expect(await verifyOffer(SECRET, body.offerId)).not.toBeNull();
  });

  it('fails closed when no signing secret is configured', async () => {
    const response = await handleQuoteRequest(quoteContext('/api/quote?postal=K1A0A6', {}));
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code?: string }).code).toBe('QUOTES_UNAVAILABLE');
  });

  it('rejects unusable inputs with INVALID_QUERY', async () => {
    const response = await handleQuoteRequest(quoteContext('/api/quote'));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code?: string }).code).toBe('INVALID_QUERY');
  });

  it('rejects an unknown dataset with DATASET_UNAVAILABLE', async () => {
    const response = await handleQuoteRequest(quoteContext('/api/quote?postal=K1A0A6&dataset=zz'));
    expect(response.status).toBe(404);
    expect(((await response.json()) as { code?: string }).code).toBe('DATASET_UNAVAILABLE');
  });
});
