/**
 * Rate limiting, keyed on **who is asking** rather than on where the request came from.
 *
 * The previous limiter keyed every bucket on the client IP. For a human on a browser that is roughly
 * right. For an agent it is wrong in both directions at once: an agent running on Lambda, Cloud Run
 * or Vercel shares an egress address with strangers and is throttled by their traffic, and the same
 * agent can rotate addresses and walk past the limit entirely. Neither of those is the limit anyone
 * intended, and the second is the one that matters — the limit did not constrain the actor it was
 * aimed at.
 *
 * Two things change here, and they are separable but both necessary:
 *
 *   1. **The key is the identity** when the request has one — the API key that authenticated — and
 *      the IP only when it does not. That is why rate limiting now runs in two halves around the
 *      auth dialect: before it, nothing is known but the address; after it, the key is.
 *
 *   2. **The counter is shared.** It lives in the `ApiKeyUsageDO`, one instance per identity, so
 *      every isolate serving that identity counts against the same number. The previous counter was
 *      a module-level `Map`, which made the real ceiling the configured limit multiplied by however
 *      many isolates happened to be serving the caller — a number nobody chose and nobody could
 *      state.
 *
 * **The failure direction is deliberate.** A counter outage falls back to the in-memory limiter
 * rather than failing open outright: an unavailable Durable Object must not take the API down, but
 * it must not remove the limit either. Degrading to the previous behaviour is the honest floor —
 * strictly worse than intended, strictly better than nothing.
 */
import type { KeyAuthResult } from './api-keys';
import { utcMinute } from './time';
import type { Env } from './types';
import { checkRateLimit, getClientId } from './utils';

/**
 * The identity a limit should be keyed on, or null when the request has none.
 *
 * Deliberately the **key**, not the Customer. A Customer's keys are separately observable, which is
 * what an operator needs when one of them misbehaves, and a per-Customer ceiling is a different
 * limit with a different purpose — it bounds one account's total draw however many keys it holds.
 * Folding the two together here would make neither of them legible.
 */
export function rateLimitIdentity(auth: KeyAuthResult | null | undefined): string | null {
  if (!auth?.ok || !auth.key) return null;
  // Server keys only. A browser key (`pk_*`) is a PUBLIC identifier — it ships in page source and
  // every visitor shares it — so keying a limit on it would give the whole internet one bucket, and
  // the first thirty requests a minute would exhaust it for everybody. Its controls are the origin
  // allowlist and a per-address limit, which is what it had.
  if (auth.key.kind !== 'server') return null;
  return `key:${auth.key.id}`;
}

/** The full bucket name: the declared bucket, then the identity, then the address as a last resort. */
export function rateLimitKey(bucket: string, request: Request, identity: string | null): string {
  return `${bucket}:${identity ?? getClientId(request)}`;
}

export interface RateWindowResult {
  allowed: boolean;
  count: number;
  limit: number;
  /** The window that refused, when one did. */
  refusedBy?: string;
}

/** One counter to check: a name and the ceiling for it. */
export interface RateWindow {
  /** The full counter name — bucket plus identity, e.g. `api:key:sk_live_abc`. */
  bucket: string;
  limit: number;
}

/**
 * Count one request against every window, in one call, and allow it only if all of them allow.
 *
 * `shard` names the Durable Object instance. It is the caller's identity, so the windows that
 * belong to one caller are already in one instance — which is why the per-key limit and the
 * per-customer ceiling can be decided together rather than in two round trips.
 *
 * All-or-nothing on refusal, matching the DO: a request blocked on one window must not consume the
 * others, or a caller already over its ceiling would look busier than it is on everything else.
 *
 * When the binding is absent — local dev, most unit tests — this falls through to the in-memory
 * limiter, so nothing that runs today needs a Durable Object to keep working. That fallback is
 * *not* all-or-nothing: it counts windows in order and stops at the first refusal, so a refused
 * request leaves the earlier ones incremented. It is the old behaviour, deliberately kept as the
 * floor rather than pretended to be equivalent.
 */
export async function consumeRateWindows(
  env: Env,
  shard: string,
  windows: readonly RateWindow[],
  nowMs: number = Date.now()
): Promise<RateWindowResult> {
  const fallback = (): RateWindowResult => {
    for (const window of windows) {
      if (!checkRateLimit({ ...env, RATE_LIMIT: window.limit }, window.bucket)) {
        return { allowed: false, count: 0, limit: window.limit, refusedBy: window.bucket };
      }
    }
    return { allowed: true, count: 0, limit: windows[0]?.limit ?? 0 };
  };

  if (!env.API_KEY_USAGE || windows.length === 0) return fallback();

  try {
    const id = env.API_KEY_USAGE.idFromName(shard);
    const stub = env.API_KEY_USAGE.get(id);
    const params = new URLSearchParams({ minute: utcMinute(nowMs) });
    for (const window of windows) {
      params.append('bucket', window.bucket);
      params.append('limit', String(window.limit));
    }
    const response = await stub.fetch(`https://usage/window?${params}`, { method: 'POST' });
    const body = (await response.json()) as RateWindowResult;
    return {
      allowed: body.allowed,
      count: body.count,
      limit: body.limit,
      ...(body.refusedBy ? { refusedBy: body.refusedBy } : {}),
    };
  } catch (error) {
    console.warn(`[rate-limit] window unavailable for ${shard}:`, error);
    return fallback();
  }
}

/** The single-window case, which is most of them. */
export async function consumeRateWindow(
  env: Env,
  bucket: string,
  key: string,
  limit: number,
  nowMs: number = Date.now()
): Promise<RateWindowResult> {
  return consumeRateWindows(env, key, [{ bucket: key, limit }], nowMs);
}

/**
 * The per-customer ceiling, as a multiple of the per-key limit.
 *
 * It cannot equal the per-key limit: a customer with two keys would then get *less* than one key's
 * allowance, which would be a regression for legitimate multi-key use. Five times means one or two
 * keys see no change at all, while minting twenty does not buy twenty times the rate. Overridable
 * with `CUSTOMER_RATE_LIMIT` when a deployment wants a different bound.
 */
export const DEFAULT_CUSTOMER_RATE_MULTIPLIER = 5;

/** The ceiling for one Customer, whatever keys it holds. */
export function customerRateLimit(env: Env, perKeyLimit: number): number {
  const configured = parseInt(String(env.CUSTOMER_RATE_LIMIT ?? ''), 10);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return perKeyLimit * DEFAULT_CUSTOMER_RATE_MULTIPLIER;
}

/** The counter name for a Customer's total draw, shared across every key it holds. */
export function customerRateBucket(customerId: string): string {
  return `customer:${customerId}`;
}
