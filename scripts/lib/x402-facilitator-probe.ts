/**
 * Probing a facilitator to confirm the envelope we speak is the one it expects.
 *
 * `docs/ops/x402-security-review.md` item 3: the `/verify` and `/settle` request and response shapes
 * follow the x402 v2 contract but have never been exercised against a real facilitator. A mis-shape
 * fails closed (nothing is charged) — but it also means the rail silently does not work, and nothing
 * here can tell the difference.
 *
 * The trick that makes this checkable without a funded wallet: send a **structurally valid but
 * unsigned** payload. A facilitator that accepts our envelope will parse it and reject the *payment*
 * ("invalid signature"), which is a completely different answer from rejecting the *request*
 * ("missing field"). The two are distinguishable, and that distinction is the whole check.
 *
 * The classification below is a heuristic over status and message text, so it reports what it saw
 * and never claims more than that. The runbook says to read the raw body when it is inconclusive.
 */

import type { PaymentRequirements } from '../../src/x402';

export interface ProbeTarget {
  facilitatorUrl: string;
  token?: string;
}

export type EnvelopeVerdict =
  | { shape: 'envelope-accepted'; status: number; detail: string }
  | { shape: 'envelope-rejected'; status: number; detail: string }
  | { shape: 'endpoint-missing'; status: number; detail: string }
  | { shape: 'unreachable'; status: 0; detail: string }
  | { shape: 'inconclusive'; status: number; detail: string };

/** A rejection of the payment itself — the request was understood. */
const SEMANTIC_REJECTION =
  /signature|authoriz|insufficient|balance|expired|nonce|allowance|payer|validbefore|validafter/i;
/** A rejection of the request's shape — our envelope is wrong. */
const SCHEMA_REJECTION =
  /required|missing|unexpected|unknown (field|property)|must be|invalid body|schema|malformed|not supported|unsupported/i;

function textOf(body: unknown): string {
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

/**
 * Decide what a `/verify` response says about our envelope. Deliberately conservative: an unclear
 * answer is `inconclusive`, never a pass.
 */
export function classifyVerifyProbe(status: number, body: unknown): EnvelopeVerdict {
  const text = textOf(body);

  if (status === 0) return { shape: 'unreachable', status, detail: text };
  if (status === 404 || status === 405) {
    return { shape: 'endpoint-missing', status, detail: text };
  }

  if (status === 200) {
    const parsed = body as { isValid?: unknown; invalidReason?: unknown } | null;
    if (parsed && typeof parsed === 'object' && parsed.isValid === false) {
      return {
        shape: 'envelope-accepted',
        status,
        detail:
          typeof parsed.invalidReason === 'string'
            ? parsed.invalidReason
            : 'isValid false with no reason',
      };
    }
    if (parsed && typeof parsed === 'object' && parsed.isValid === true) {
      // The payload verified too. Still an envelope confirmation; it says nothing about settlement.
      return { shape: 'envelope-accepted', status, detail: 'isValid true' };
    }
    return { shape: 'inconclusive', status, detail: text };
  }

  if (status === 400 || status === 422) {
    // A semantic rejection means the fields arrived and were read; only a shape complaint means our
    // envelope is wrong. Check the semantic words first — "invalid signature" also contains "invalid".
    if (SEMANTIC_REJECTION.test(text)) return { shape: 'envelope-accepted', status, detail: text };
    if (SCHEMA_REJECTION.test(text)) return { shape: 'envelope-rejected', status, detail: text };
    return { shape: 'inconclusive', status, detail: text };
  }

  return { shape: 'inconclusive', status, detail: text };
}

export interface SupportedSummary {
  reachable: boolean;
  /** The raw `/supported` body, or null when the endpoint is absent. */
  raw: unknown;
  /** Whether the configured network and asset appear in the facilitator's advertised list. */
  listsNetwork: boolean | null;
  listsAsset: boolean | null;
}

/** Summarise `GET /supported`, tolerating a facilitator that does not implement it. */
export function summariseSupported(
  body: unknown,
  config: { network: string; asset: string }
): SupportedSummary {
  if (body === null || body === undefined) {
    return { reachable: false, raw: null, listsNetwork: null, listsAsset: null };
  }
  const text = textOf(body);
  const kinds = (body as { kinds?: unknown }).kinds;
  const rows = Array.isArray(kinds) ? kinds : [];
  const networks = rows
    .map((row) => (row as { network?: unknown }).network)
    .filter((value): value is string => typeof value === 'string');
  const assets = rows
    .map((row) => (row as { extra?: { asset?: unknown } }).extra?.asset)
    .filter((value): value is string => typeof value === 'string');

  return {
    reachable: true,
    raw: body,
    // Fall back to a substring test when the shape is not the one expected: an unparsed list should
    // read as "cannot tell", never as "not supported".
    listsNetwork: networks.length ? networks.includes(config.network) : null,
    listsAsset: assets.length ? assets.includes(config.asset) : text.includes(config.asset),
  };
}

async function post(target: ProbeTarget, path: string, body: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (target.token) headers.Authorization = `Bearer ${target.token}`;
  const response = await fetch(`${target.facilitatorUrl.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep the raw text */
  }
  return { status: response.status, body: parsed };
}

/**
 * Send our exact `/verify` envelope. `paymentPayload` is normally a structurally valid but unsigned
 * placeholder — see the module note for why that is enough to check the envelope.
 */
export async function probeVerify(
  target: ProbeTarget,
  paymentPayload: unknown,
  paymentRequirements: PaymentRequirements
): Promise<EnvelopeVerdict> {
  try {
    const { status, body } = await post(target, '/verify', { paymentPayload, paymentRequirements });
    return classifyVerifyProbe(status, body);
  } catch (error) {
    return { shape: 'unreachable', status: 0, detail: String(error) };
  }
}

/** `GET /supported`, or null when the facilitator does not implement it. */
export async function probeSupported(target: ProbeTarget): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (target.token) headers.Authorization = `Bearer ${target.token}`;
  try {
    const response = await fetch(`${target.facilitatorUrl.replace(/\/+$/, '')}/supported`, {
      headers,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
