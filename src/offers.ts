/**
 * Offers: the no-charge, expiring quote an agent accepts before paying (plan W5, ADR 0007).
 *
 * An offer is a **signed, self-contained token** — nothing is stored, and nothing is charged.
 * Requesting a quote is a pure function of the validated inputs, the dataset vintage and the
 * published unit price, plus an expiry, so it never touches the usage ledger. Acceptance (W6)
 * verifies the signature and the expiry, which is what makes the price, vintage and inputs
 * immutable between quote and acceptance.
 *
 * The signature is HMAC-SHA256 over the exact payload bytes, and verification recomputes it over
 * the same bytes — no canonicalisation, so key order can never change the result.
 */

import { z } from 'zod';
import { datasetMetaForPath, getRouteForR2Key, isLookupPath, type RidingDatasetKey } from './datasets';
import { handleLookupRequest } from './lookup-handler';
import { r2DatasetSource } from './dataset-source';
import { getAddressStore } from './address-store';
import { AREA_PAGE_MAX, readAreaPage } from './area-query';
import { AREA_ATTRIBUTION, buildAreaEnvelope, hasAddressCoverage, resolveRiding } from './area-request';
import { UPLOAD_ROW_PRICE_USD } from './upload-sheet';
import { badRequest, parseQuery, timingSafeEqual } from './utils';
import {
  base64Json,
  buildPaymentRequired,
  decodeBase64Json,
  HttpFacilitator,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  x402ConfigFromEnv,
  type PaymentFacilitator,
  type PaymentRequirements,
  type X402Config,
} from './x402';
import type { QueryParams } from './types';
import type { RouteContext } from './route-context';
import { receiptsBound, recordReceipt, type X402Receipt } from './x402-receipts';

/** How long a quote is valid. Short: it bounds how stale a price or vintage can be when accepted. */
export const OFFER_TTL_MS = 10 * 60 * 1000;

/** One area unit is 250 records, priced at $2.00 (W0 §7). */
export const AREA_UNIT_RECORDS = 250;
export const AREA_UNIT_PRICE_USD = 2;

/** The most records one area offer may cover in v1 (W7 §7). */
export const AREA_MAX_RESULTS = 1000;

/** The point lookup offers one result at the canonical unit price. */
const LookupOfferSchema = z.object({
  operation: z.literal('lookup.point'),
  scope: z.object({
    inputs: z.record(z.string(), z.unknown()),
    datasetId: z.string(),
    datasetYear: z.number(),
  }),
  estimate: z.object({ resultCount: z.number(), exact: z.boolean() }),
  price: z.object({ currency: z.literal('USD'), maximum: z.number() }),
  limits: z.object({ maximumResults: z.number(), expiresAt: z.string() }),
  /**
   * Empty until W6 enables the x402 rail. Publishing a payment method before it can be honoured
   * would send agents to a flow that fails — the plan's "publish only live capabilities" rule.
   */
  paymentMethods: z.array(z.string()),
});

/** An area search offers up to `maximumResults` records within a riding, in 250-record units. */
const AreaOfferSchema = z.object({
  operation: z.literal('area.search'),
  scope: z.object({
    /** The riding the query is bounded to, as the caller named it. */
    riding: z.string(),
    datasetId: z.string(),
    datasetYear: z.number(),
  }),
  estimate: z.object({ resultCount: z.number().nullable(), exact: z.boolean() }),
  price: z.object({ currency: z.literal('USD'), maximum: z.number() }),
  limits: z.object({ maximumResults: z.number(), expiresAt: z.string() }),
  paymentMethods: z.array(z.string()),
});

const OfferPayloadSchema = z.discriminatedUnion('operation', [LookupOfferSchema, AreaOfferSchema]);

export type LookupOfferPayload = z.infer<typeof LookupOfferSchema>;
export type AreaOfferPayload = z.infer<typeof AreaOfferSchema>;
export type OfferPayload = z.infer<typeof OfferPayloadSchema>;
export type Offer = OfferPayload & { offerId: string };

/**
 * The paid page cursor.
 *
 * Retrieval is offer-only, so there is no keyed area route — which means the authorization to read
 * page two has to come from payment, and since one charge covers every page it cannot be a second
 * charge. A signed cursor minted only by the accept path is that authorization: unforgeable, tied to
 * the offer it belongs to, and expiring with it. Without it there is no way to page without paying;
 * with it there is no way to pay twice for one offer.
 */
const AreaPageCursorSchema = z.object({
  id: z.number().int().nonnegative(),
  riding: z.string(),
  datasetId: z.string(),
  datasetYear: z.number(),
  offerId: z.string(),
  expiresAt: z.string(),
});

export type AreaPageCursor = z.infer<typeof AreaPageCursorSchema>;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSha256(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return toBase64Url(new Uint8Array(signature));
}

/** Sign a payload into the opaque `offerId` an agent hands back at acceptance. */
export async function signOffer(secret: string, payload: OfferPayload): Promise<string> {
  const body = JSON.stringify(payload);
  const signature = await hmacSha256(secret, body);
  return `${toBase64Url(new TextEncoder().encode(body))}.${signature}`;
}

/**
 * Verify an `offerId` and return its payload, or null when it is malformed, tampered with, or
 * expired. Acceptance (W6) calls this before charging or delivering anything.
 */
export async function verifyOffer(
  secret: string,
  offerId: string,
  nowMs: number = Date.now()
): Promise<OfferPayload | null> {
  const [bodyPart, signaturePart] = offerId.split('.');
  if (!bodyPart || !signaturePart) return null;

  let body: string;
  try {
    body = new TextDecoder().decode(fromBase64Url(bodyPart));
  } catch {
    return null;
  }

  const expected = await hmacSha256(secret, body);
  if (!timingSafeEqual(expected, signaturePart)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = OfferPayloadSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (Date.parse(parsed.data.limits.expiresAt) <= nowMs) return null;
  return parsed.data;
}

/** The lookup-identity fields an offer binds to. Presentation fields (return, …) are not scope. */
export function offerInputs(query: QueryParams): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  if (query.address !== undefined) inputs.address = query.address;
  if (query.postal !== undefined) inputs.postal = query.postal;
  if (query.lat !== undefined) inputs.lat = query.lat;
  if (query.lon !== undefined) inputs.lon = query.lon;
  if (query.city !== undefined) inputs.city = query.city;
  if (query.state !== undefined) inputs.state = query.state;
  if (query.country !== undefined) inputs.country = query.country;
  if (query.includeProvince !== undefined) inputs.includeProvince = query.includeProvince;
  // The API's own parameter name, so delivery replays the exact request the quote bound.
  if (query.geocodeMethod !== undefined) inputs.geocode_method = query.geocodeMethod;
  return inputs;
}

/** The price ceiling for an area offer: whole 250-record units, rounded up. */
export function areaPriceUsd(maximumResults: number): number {
  return Math.ceil(maximumResults / AREA_UNIT_RECORDS) * AREA_UNIT_PRICE_USD;
}

export async function createOffer(
  secret: string,
  options: { lookupPathname: string; query: QueryParams; nowMs?: number }
): Promise<Offer> {
  const meta = datasetMetaForPath(options.lookupPathname);
  const now = options.nowMs ?? Date.now();
  const payload: LookupOfferPayload = {
    operation: 'lookup.point',
    scope: {
      inputs: offerInputs(options.query),
      datasetId: meta.id,
      datasetYear: meta.year,
    },
    estimate: { resultCount: 1, exact: true },
    price: { currency: 'USD', maximum: UPLOAD_ROW_PRICE_USD },
    limits: { maximumResults: 1, expiresAt: new Date(now + OFFER_TTL_MS).toISOString() },
    paymentMethods: [],
  };
  return { offerId: await signOffer(secret, payload), ...payload };
}

/**
 * An area offer: up to `maximumResults` records within a riding, priced in 250-record units. The
 * ceiling is `ceil(maximumResults / 250) × unit price`, so the page count can never change what the
 * buyer pays — pages are delivery, not charges (W7 §7).
 */
export async function createAreaOffer(
  secret: string,
  options: {
    riding: string;
    datasetId: string;
    datasetYear: number;
    maximumResults: number;
    total?: number | null;
    nowMs?: number;
  }
): Promise<Offer> {
  const now = options.nowMs ?? Date.now();
  const payload: AreaOfferPayload = {
    operation: 'area.search',
    scope: {
      riding: options.riding,
      datasetId: options.datasetId,
      datasetYear: options.datasetYear,
    },
    estimate: {
      resultCount: options.total ?? null,
      exact: options.total !== undefined && options.total !== null,
    },
    price: { currency: 'USD', maximum: areaPriceUsd(options.maximumResults) },
    limits: {
      maximumResults: options.maximumResults,
      expiresAt: new Date(now + OFFER_TTL_MS).toISOString(),
    },
    paymentMethods: [],
  };
  return { offerId: await signOffer(secret, payload), ...payload };
}

/** Mint the cursor that authorizes the pages after the first. Only the accept path calls this. */
export async function signAreaPageCursor(secret: string, cursor: AreaPageCursor): Promise<string> {
  const body = JSON.stringify(cursor);
  return `${toBase64Url(new TextEncoder().encode(body))}.${await hmacSha256(secret, body)}`;
}

/** Verify a page cursor, or null when it is malformed, tampered with, or expired. */
export async function verifyAreaPageCursor(
  secret: string,
  token: string,
  nowMs: number = Date.now()
): Promise<AreaPageCursor | null> {
  const [bodyPart, signaturePart] = token.split('.');
  if (!bodyPart || !signaturePart) return null;

  let body: string;
  try {
    body = new TextDecoder().decode(fromBase64Url(bodyPart));
  } catch {
    return null;
  }
  if (!timingSafeEqual(await hmacSha256(secret, body), signaturePart)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = AreaPageCursorSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (Date.parse(parsed.data.expiresAt) <= nowMs) return null;
  return parsed.data;
}

/**
 * `GET /api/quote` — the keyless, no-charge quote. Takes the same lookup inputs the lookup routes
 * take, plus `dataset` to choose which boundary set the quote describes. Nothing here reads or
 * writes the usage ledger: a quote is free by construction.
 */
export async function handleQuoteRequest(ctx: RouteContext): Promise<Response> {
  const { request, env, correlationId, corsHeaders } = ctx;
  const secret = env.OFFER_SIGNING_SECRET;
  if (!secret) {
    // Fail closed: an unsigned offer must never be issued.
    return badRequest('Quoting is not configured', 503, 'QUOTES_UNAVAILABLE', correlationId);
  }

  const operation = ctx.url.searchParams.get('operation') || 'lookup.point';
  if (operation === 'area.search') {
    return handleAreaQuote(ctx, secret);
  }
  if (operation !== 'lookup.point') {
    return badRequest(`Unknown operation '${operation}'`, 400, 'INVALID_QUERY', correlationId);
  }

  const { validation } = parseQuery(request);
  if (!validation.valid) {
    return badRequest(validation.error || 'Invalid query parameters', 400, 'INVALID_QUERY', correlationId);
  }

  const dataset = ctx.url.searchParams.get('dataset') || 'federal';
  const lookupPathname = `/api/${dataset}`;
  if (!isLookupPath(lookupPathname)) {
    return badRequest(`Dataset '${dataset}' is not available`, 404, 'DATASET_UNAVAILABLE', correlationId);
  }

  const offer = await createOffer(secret, {
    lookupPathname,
    query: validation.sanitized!,
  });

  return new Response(JSON.stringify(offer), {
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
      ...corsHeaders(request.headers.get('Origin')),
    },
  });
}

/** A `402` carrying the payment requirements, per the x402 flow. */
function paymentRequired(
  ctx: RouteContext,
  offer: Offer,
  config: X402Config,
  error: string,
  status = 402
): Response {
  const requirements = buildPaymentRequired(
    config,
    offer,
    `${ctx.url.origin}${ctx.url.pathname}`
  );
  return new Response(JSON.stringify({ ...requirements, error }), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
      [PAYMENT_REQUIRED_HEADER]: base64Json({ ...requirements, error }),
      ...ctx.corsHeaders(ctx.request.headers.get('Origin')),
    },
  });
}

/** Retry settlement exactly once on `settlement_pending`, which is non-terminal. */
async function settleWithRetry(
  facilitator: PaymentFacilitator,
  paymentPayload: unknown,
  requirements: PaymentRequirements
) {
  const first = await facilitator.settle(paymentPayload, requirements);
  if (first.pending) {
    return facilitator.settle(paymentPayload, requirements);
  }
  return first;
}

/** Re-run the exact lookup the offer bound, with no workspace billing — a direct payment is its own. */
async function deliverOffer(ctx: RouteContext, offer: LookupOfferPayload): Promise<Response> {
  const inputs = offer.scope.inputs as Record<string, unknown>;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(inputs)) {
    if (key === 'includeProvince') {
      if (value === true) params.set('include_province', 'true');
      continue;
    }
    params.set(key, String(value));
  }
  const pathname = getRouteForR2Key(offer.scope.datasetId as RidingDatasetKey);
  const url = `${ctx.url.origin}${pathname}?${params.toString()}`;
  const lookupRequest = new Request(url, { method: 'GET', headers: ctx.request.headers });
  return handleLookupRequest({
    ...ctx,
    request: lookupRequest,
    url: new URL(url),
    billing: null,
  });
}

/**
 * Deliver the first page of an area offer and mint the cursor for the pages after it. The cursor is
 * the only authorization to keep reading, so it is signed here and nowhere else — which is what makes
 * "offer-only retrieval" hold without a keyed route.
 */
async function deliverAreaOffer(
  ctx: RouteContext,
  offer: AreaOfferPayload,
  offerId: string,
  secret: string
): Promise<{ response: Response; resultCount: number }> {
  const { env, correlationId } = ctx;

  const resolved = await resolveRiding(r2DatasetSource(env), {
    r2Key: offer.scope.datasetId,
    datasetId: offer.scope.datasetId,
    datasetYear: offer.scope.datasetYear,
    riding: offer.scope.riding,
  });
  if (!resolved.ok) {
    const status = resolved.code === 'RIDING_NOT_FOUND' ? 404 : 422;
    return {
      response: badRequest('The riding could not be resolved', status, resolved.code, correlationId),
      resultCount: 0,
    };
  }
  if (!hasAddressCoverage(env, resolved.province)) {
    // Never an empty page: that reads as "no addresses here" rather than "not imported".
    return {
      response: badRequest(
        `No address coverage for ${resolved.province}`,
        404,
        'NO_ADDRESS_COVERAGE',
        correlationId
      ),
      resultCount: 0,
    };
  }
  if (!env.ODA_DB) {
    return {
      response: badRequest('Address data is unavailable', 503, 'DATASET_UNAVAILABLE', correlationId),
      resultCount: 0,
    };
  }

  const page = await readAreaPage({
    store: getAddressStore(env.ODA_DB, () => {}),
    province: resolved.province,
    boundary: resolved.geometry,
    pageSize: Math.min(AREA_PAGE_MAX, offer.limits.maximumResults),
  });

  // Never over-deliver past what was paid for: stop at the ceiling and say so.
  const truncated = page.records.length >= offer.limits.maximumResults;
  const nextId = page.hasMore && !truncated ? page.nextId : null;
  const cursor =
    nextId === null
      ? null
      : await signAreaPageCursor(secret, {
          id: nextId,
          riding: offer.scope.riding,
          datasetId: offer.scope.datasetId,
          datasetYear: offer.scope.datasetYear,
          offerId,
          expiresAt: offer.limits.expiresAt,
        });

  const envelope = buildAreaEnvelope({
    ref: resolved.ref,
    query: { dataset: offer.scope.datasetId, riding: offer.scope.riding },
    records: page.records,
    page: { cursor, hasMore: nextId !== null, truncated },
    total: offer.estimate.resultCount,
    attribution: AREA_ATTRIBUTION,
  });

  return {
    response: new Response(JSON.stringify(envelope), {
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'cache-control': 'no-store',
        ...ctx.corsHeaders(ctx.request.headers.get('Origin')),
      },
    }),
    resultCount: page.records.length,
  };
}

/** `GET /api/quote?operation=area.search` — the area quote, bounded and priced in 250-record units. */
async function handleAreaQuote(ctx: RouteContext, secret: string): Promise<Response> {
  const { env, correlationId, corsHeaders } = ctx;

  const dataset = ctx.url.searchParams.get('dataset') || 'federal';
  const lookupPathname = `/api/${dataset}`;
  if (!isLookupPath(lookupPathname)) {
    return badRequest(`Dataset '${dataset}' is not available`, 404, 'DATASET_UNAVAILABLE', correlationId);
  }

  const riding = ctx.url.searchParams.get('riding');
  if (!riding) {
    return badRequest('Provide ?riding=<id-or-name>', 400, 'INVALID_QUERY', correlationId);
  }

  const requested = Number(ctx.url.searchParams.get('maximum_results') ?? '');
  const maximumResults =
    Number.isFinite(requested) && requested > 0 ? Math.trunc(requested) : AREA_UNIT_RECORDS;
  if (maximumResults > AREA_MAX_RESULTS) {
    return badRequest(
      `maximum_results exceeds the ${AREA_MAX_RESULTS}-record limit`,
      400,
      'LIMIT_EXCEEDED',
      correlationId
    );
  }

  const meta = datasetMetaForPath(lookupPathname);
  const resolved = await resolveRiding(r2DatasetSource(env), {
    r2Key: meta.id,
    datasetId: meta.id,
    datasetYear: meta.year,
    riding,
  });
  if (!resolved.ok) {
    const status = resolved.code === 'RIDING_NOT_FOUND' ? 404 : 422;
    return badRequest('The riding could not be resolved', status, resolved.code, correlationId);
  }
  if (!hasAddressCoverage(env, resolved.province)) {
    return badRequest(`No address coverage for ${resolved.province}`, 404, 'NO_ADDRESS_COVERAGE', correlationId);
  }

  // The count is not computed at quote time — an exact count costs a scan, and the contract allows
  // an estimate as long as it is labelled as one.
  const offer = await createAreaOffer(secret, {
    riding,
    datasetId: meta.id,
    datasetYear: meta.year,
    maximumResults,
  });

  return new Response(JSON.stringify(offer), {
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
      ...corsHeaders(ctx.request.headers.get('Origin')),
    },
  });
}

/**
 * `GET /api/area?cursor=<signed>` — the pages after the first.
 *
 * There is no keyed area route: retrieval is offer-only, and the signed cursor minted by the accept
 * path is the whole authorization. An unsigned or foreign cursor is rejected, so this cannot be used
 * to read addresses without paying.
 */
export async function handleAreaRequest(ctx: RouteContext): Promise<Response> {
  const { env, correlationId, corsHeaders } = ctx;
  const secret = env.OFFER_SIGNING_SECRET;
  if (!secret) {
    return badRequest('Quoting is not configured', 503, 'QUOTES_UNAVAILABLE', correlationId);
  }

  const token = ctx.url.searchParams.get('cursor');
  if (!token) {
    return badRequest('Provide ?cursor=<page cursor from an accepted offer>', 400, 'INVALID_QUERY', correlationId);
  }

  const cursor = await verifyAreaPageCursor(secret, token);
  if (!cursor) {
    return badRequest('The page cursor is invalid, tampered with, or expired', 410, 'CURSOR_INVALID', correlationId);
  }

  const resolved = await resolveRiding(r2DatasetSource(env), {
    r2Key: cursor.datasetId,
    datasetId: cursor.datasetId,
    datasetYear: cursor.datasetYear,
    riding: cursor.riding,
  });
  if (!resolved.ok) {
    const status = resolved.code === 'RIDING_NOT_FOUND' ? 404 : 422;
    return badRequest('The riding could not be resolved', status, resolved.code, correlationId);
  }
  if (!hasAddressCoverage(env, resolved.province)) {
    return badRequest(`No address coverage for ${resolved.province}`, 404, 'NO_ADDRESS_COVERAGE', correlationId);
  }
  if (!env.ODA_DB) {
    return badRequest('Address data is unavailable', 503, 'DATASET_UNAVAILABLE', correlationId);
  }

  const page = await readAreaPage({
    store: getAddressStore(env.ODA_DB, () => {}),
    province: resolved.province,
    boundary: resolved.geometry,
    afterId: cursor.id,
    pageSize: AREA_PAGE_MAX,
  });

  const nextId = page.hasMore ? page.nextId : null;
  const nextCursor =
    nextId === null
      ? null
      : await signAreaPageCursor(secret, { ...cursor, id: nextId });

  const envelope = buildAreaEnvelope({
    ref: resolved.ref,
    query: { dataset: cursor.datasetId, riding: cursor.riding },
    records: page.records,
    page: { cursor: nextCursor, hasMore: nextId !== null, truncated: false },
    total: null,
    attribution: AREA_ATTRIBUTION,
  });

  return new Response(JSON.stringify(envelope), {
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
      ...corsHeaders(ctx.request.headers.get('Origin')),
    },
  });
}

/**
 * `POST /api/quote/accept?offer=<offerId>` — execute an accepted offer through x402.
 *
 * Without a `PAYMENT-SIGNATURE` header this answers `402` with the requirements. With one it
 * verifies, settles, then delivers the quoted lookup and a receipt. Settlement can only happen once
 * for a given signed payload (the facilitator/chain enforces it), and the delivered lookup is a
 * read-only, idempotent operation, so a retry can neither double-charge nor produce a different
 * result.
 */
export async function handleAcceptRequest(ctx: RouteContext): Promise<Response> {
  const { request, env, correlationId } = ctx;

  const secret = env.OFFER_SIGNING_SECRET;
  if (!secret) {
    return badRequest('Quoting is not configured', 503, 'QUOTES_UNAVAILABLE', correlationId);
  }

  const offerId = ctx.url.searchParams.get('offer');
  if (!offerId) {
    return badRequest('Provide ?offer=<offerId>', 400, 'OFFER_REQUIRED', correlationId);
  }

  const payload = await verifyOffer(secret, offerId);
  if (!payload) {
    return badRequest(
      'The offer is invalid, tampered with, or expired',
      410,
      'OFFER_INVALID',
      correlationId
    );
  }
  const offer: Offer = { offerId, ...payload };

  const config = x402ConfigFromEnv(env);
  if (!config) {
    return badRequest('Payments are not available', 503, 'PAYMENTS_UNAVAILABLE', correlationId);
  }
  if (!receiptsBound(env)) {
    // A settled payment with nowhere to record its receipt cannot be reconciled, so the rail stays
    // closed rather than taking money it cannot account for.
    return badRequest('Payments are not available', 503, 'PAYMENTS_UNAVAILABLE', correlationId);
  }

  const paymentHeader = request.headers.get(PAYMENT_SIGNATURE_HEADER);
  if (!paymentHeader) {
    return paymentRequired(ctx, offer, config, 'Payment required');
  }

  let paymentPayload: unknown;
  try {
    paymentPayload = decodeBase64Json(paymentHeader);
  } catch {
    return badRequest('Malformed PAYMENT-SIGNATURE header', 400, 'PAYMENT_MALFORMED', correlationId);
  }

  const requirements = buildPaymentRequired(config, offer, `${ctx.url.origin}${ctx.url.pathname}`)
    .accepts[0];
  const facilitator = new HttpFacilitator(config);

  let verification;
  try {
    verification = await facilitator.verify(paymentPayload, requirements);
  } catch {
    return badRequest('Payment verification failed', 502, 'PAYMENT_VERIFY_FAILED', correlationId);
  }
  if (!verification.isValid) {
    return paymentRequired(ctx, offer, config, verification.invalidReason || 'Payment is not valid');
  }

  let settlement;
  try {
    settlement = await settleWithRetry(facilitator, paymentPayload, requirements);
  } catch {
    return badRequest('Settlement failed', 502, 'SETTLEMENT_FAILED', correlationId);
  }
  if (settlement.pending) {
    // Non-terminal: the transaction may still confirm. Never re-charge; reconcile on chain.
    return badRequest(
      'Settlement is pending; reconcile before retrying',
      502,
      'SETTLEMENT_PENDING',
      correlationId
    );
  }
  if (!settlement.success) {
    return paymentRequired(ctx, offer, config, settlement.errorReason || 'Settlement failed');
  }

  // Settled. Deliver exactly what was quoted.
  const delivery =
    offer.operation === 'lookup.point'
      ? { response: await deliverOffer(ctx, offer), resultCount: offer.estimate.resultCount }
      : await deliverAreaOffer(ctx, offer, offerId, secret);
  const delivered = delivery.response;
  const result = await delivered.json();

  const receipt: X402Receipt = {
    offerId,
    operation: offer.operation,
    settlement: {
      transaction: settlement.transaction,
      network: settlement.network ?? config.network,
    },
    amount: { currency: offer.price.currency, value: offer.price.maximum },
    scope: { datasetId: offer.scope.datasetId, datasetYear: offer.scope.datasetYear },
    resultCount: delivery.resultCount,
    delivered: delivered.ok,
    correlationId,
    recordedAt: new Date().toISOString(),
  };
  await recordReceipt(env, receipt);

  if (!delivered.ok) {
    // Charged but not delivered: the receipt records it so reconciliation can credit it, and a
    // retry must never re-charge. A durable credit/refund path is the follow-up named in ADR 0007.
    console.error(
      `[X402] settled but delivery failed (${delivered.status}) for offer ${offerId}: ${settlement.transaction ?? 'no-tx'}`
    );
    return badRequest(
      'Payment settled but delivery failed; contact support with this correlation id',
      502,
      'SETTLEMENT_DELIVERY_FAILED',
      correlationId
    );
  }

  return new Response(JSON.stringify({ receipt, result }), {
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
      [PAYMENT_RESPONSE_HEADER]: base64Json(settlement),
      ...ctx.corsHeaders(ctx.request.headers.get('Origin')),
    },
  });
}
