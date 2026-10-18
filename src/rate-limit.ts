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
}

/**
 * Count one request against a shared per-minute window, returning whether it is allowed.
 *
 * When the binding is absent — local dev, most unit tests — this falls straight through to the
 * in-memory limiter, so nothing that runs today needs a Durable Object to keep working.
 */
export async function consumeRateWindow(
  env: Env,
  bucket: string,
  key: string,
  limit: number,
  nowMs: number = Date.now()
): Promise<RateWindowResult> {
  const fallback = (): RateWindowResult => ({
    allowed: checkRateLimit({ ...env, RATE_LIMIT: limit }, key),
    count: 0,
    limit,
  });

  if (!env.API_KEY_USAGE || limit <= 0) return fallback();

  try {
    const id = env.API_KEY_USAGE.idFromName(key);
    const stub = env.API_KEY_USAGE.get(id);
    const minute = utcMinute(nowMs);
    const response = await stub.fetch(
      `https://usage/window?bucket=${encodeURIComponent(bucket)}&minute=${minute}&limit=${limit}`,
      { method: 'POST' }
    );
    const body = (await response.json()) as RateWindowResult;
    return { allowed: body.allowed, count: body.count, limit: body.limit };
  } catch (error) {
    console.warn(`[rate-limit] window unavailable for ${key}:`, error);
    return fallback();
  }
}
