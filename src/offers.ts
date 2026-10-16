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
import { datasetMetaForPath, isLookupPath } from './datasets';
import { UPLOAD_ROW_PRICE_USD } from './upload-sheet';
import { badRequest, parseQuery, timingSafeEqual } from './utils';
import type { QueryParams } from './types';
import type { RouteContext } from './route-context';

/** How long a quote is valid. Short: it bounds how stale a price or vintage can be when accepted. */
export const OFFER_TTL_MS = 10 * 60 * 1000;

/** The only operation offered today. Area search adds its own when it ships (W7/W8). */
export const OFFER_OPERATION = 'lookup.point';

const OfferPayloadSchema = z.object({
  operation: z.literal(OFFER_OPERATION),
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

export type OfferPayload = z.infer<typeof OfferPayloadSchema>;
export type Offer = OfferPayload & { offerId: string };

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
  if (query.geocodeMethod !== undefined) inputs.geocodeMethod = query.geocodeMethod;
  return inputs;
}

export async function createOffer(
  secret: string,
  options: { lookupPathname: string; query: QueryParams; nowMs?: number }
): Promise<Offer> {
  const meta = datasetMetaForPath(options.lookupPathname);
  const now = options.nowMs ?? Date.now();
  const payload: OfferPayload = {
    operation: OFFER_OPERATION,
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
