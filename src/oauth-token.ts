/**
 * Verifying an OAuth access token issued by our own authorization server.
 *
 * The token is a JWT signed by the portal's Better Auth instance, verified against its JWKS. Four
 * things are checked beyond the signature, and each of them is load-bearing:
 *
 *   - **the issuer** (`iss`), so a token minted by some other authorization server is not accepted;
 *   - **the audience** (`aud`), so a token minted for a *different* resource is not accepted — this
 *     is the whole point of RFC 8707 resource binding, and skipping it is how a token for one
 *     service becomes a token for every service that trusts the same issuer;
 *   - **the expiry**, which `jwtVerify` enforces;
 *   - **the session** (`sid`), so a token whose session has ended stops working. A JWT is
 *     self-contained, so this is the only thing in it that points at mutable server state — and it
 *     is what makes "signing out stops the agent" true rather than nearly true. See ADR-0011.
 *
 * The Customer comes from a claim the authorization server adds at issuance, not from a database
 * lookup here. That keeps the API worker out of the portal's database — `PORTAL_DB` is portal-only by
 * design — and it means the binding is decided once, at consent, where a human could have been shown
 * it, rather than per request where nobody can.
 *
 * A token with no Customer claim is refused rather than billed to nobody. It should be impossible,
 * and "impossible" is exactly the case worth failing closed on.
 */
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet, type JWTPayload } from 'jose';

import type { Env } from './types';

export interface OAuthTokenClaims {
  /** The user the token was issued to. */
  subject: string;
  /** The Customer whose allowance and meter the call is billed against. */
  customerId: string;
  /** Scopes granted, as a list. */
  scopes: string[];
  /**
   * The OAuth client the token was issued to.
   *
   * `client_id` is the standard claim and `azp` carries the same value; a client that predates
   * `azp` sets only the former. Empty when the token carries neither, which is not a reason to
   * refuse it — the signature, the issuer and the audience are what decide that.
   */
  clientId: string;
  /** When the token expires, in seconds since the epoch. */
  expiresAt?: number;
}

export type OAuthTokenFailure =
  /** Malformed, badly signed, expired, or issued for someone else. */
  | 'invalid'
  /** Validly signed, but carries no Customer — refuse rather than bill nobody. */
  | 'no_customer'
  /**
   * Validly signed and billed, but the session it was minted for has ended.
   *
   * Distinct internally so the log can say what happened, but it answers the caller exactly as
   * `invalid` does — the difference between "your signature is wrong" and "you signed out" is not
   * one a caller can act on differently, and telling them apart would make this an oracle for
   * probing tokens.
   */
  | 'session_ended';

export type OAuthTokenResult =
  | { ok: true; claims: OAuthTokenClaims }
  | { ok: false; reason: OAuthTokenFailure };

/**
 * The signing key, read from the portal's `jwks` table rather than fetched over HTTP.
 *
 * **`createRemoteJWKSet` does not work here, and the reason is not obvious.** This Worker would be
 * fetching its own hostname, and that subrequest does not come back 200 — jose reports
 * "Expected 200 OK from the JSON Web Key Set HTTP response" and every token is rejected. Measured
 * against a live deployment, not assumed.
 *
 * Reading the row is also the better answer: the table already holds the key as a JWK, the read is
 * one indexed row, and it cannot go stale behind a cache the way a fetched copy can.
 *
 * **This reads `PORTAL_DB`, which is portal-only by design**, and that is a deliberate, narrow
 * exception rather than an oversight: one column of one table, holding a *public* signing key that
 * the authorization server publishes at `/api/auth/jwks` for anyone to read. No tenant data is
 * touched, and the alternative is machinery to mirror a public key into KV on every rotation.
 *
 * The same binding is used for the `session` row an access token was minted for — also not tenant
 * data, and also a row that has to be read where it is written. See ADR-0011.
 *
 * Cached for a minute per isolate: keys rotate rarely, and a stale key costs one rejected request
 * rather than a wrong answer.
 */
const JWKS_TTL_MS = 60_000;
let cachedJwks: { client: ReturnType<typeof createLocalJWKSet>; expires: number } | null = null;

async function jwksFor(env: Env): Promise<ReturnType<typeof createLocalJWKSet> | null> {
  if (cachedJwks && cachedJwks.expires > Date.now()) return cachedJwks.client;
  if (!env.PORTAL_DB) return null;

  // `id` is the `kid`. It is NOT in the stored JSON, and the token's protected header names it, so
  // a JWKS built without it has no key jose can match — the failure is "no applicable key found in
  // the JSON Web Key Set", which says nothing about the missing field. Found by comparing the stored
  // row against what `/api/auth/jwks` actually publishes.
  const row = await env.PORTAL_DB.prepare(
    'SELECT id, public_key, alg FROM jwks ORDER BY created_at DESC LIMIT 1'
  ).first<{ id: string; public_key: string; alg: string | null }>();
  if (!row?.public_key) return null;

  let key: Record<string, unknown>;
  try {
    key = JSON.parse(row.public_key) as Record<string, unknown>;
  } catch {
    console.warn('[oauth] the stored JWKS public key is not JSON');
    return null;
  }

  // `alg` and the key id live in their own columns, and jose needs both on the key to select a
  // verifier — `alg` to choose the algorithm, `kid` to match the token's header.
  const jwks: JSONWebKeySet = {
    keys: [{ ...key, kid: row.id, ...(row.alg ? { alg: row.alg } : {}), use: 'sig' }],
  };
  const client = createLocalJWKSet(jwks);
  cachedJwks = { client, expires: Date.now() + JWKS_TTL_MS };
  return client;
}

/** Test seam: drop the cached signing key. */
export function clearJwksCache(): void {
  cachedJwks = null;
}

/**
 * How long a "this session is alive" verdict is trusted without asking the database.
 *
 * This is the revocation latency. A person who signs out can still use the token for at most this
 * long, plus the grace window below. Fifteen seconds is short enough that "signing out stops the
 * agent" is true in the sense a person means it, and long enough that an agent's tool calls do not
 * each cost a query.
 */
const SESSION_VERDICT_TTL_MS = 15_000;

/**
 * How long a *live* verdict survives a database error.
 *
 * A D1 blip must not take OAuth auth down for every caller at once. Inside this window a verdict
 * of "live" is still honoured, so an outage of up to a minute costs nothing but a delayed
 * revocation; past it, the answer is "not live", because an availability failure must not become
 * an unbounded bypass of the check.
 */
const SESSION_VERDICT_GRACE_MS = 60_000;

/** Cap on the verdict cache, so a flood of distinct sessions cannot grow it without bound. */
const SESSION_VERDICT_CACHE_MAX = 5_000;

type SessionVerdict = { live: boolean; checkedAt: number };

const sessionVerdicts = new Map<string, SessionVerdict>();

/** Test seam: drop the cached session verdicts. */
export function clearSessionVerdictCache(): void {
  sessionVerdicts.clear();
}

/**
 * Whether the session-liveness check runs at all.
 *
 * `OAUTH_SESSION_CHECK=off` turns it off, so a deployment that turns out to be wrong can be
 * reversed without a redeploy of code — the same reason `isOdaSuggestEnabled` exists. Anything
 * other than the literal `off` means the check runs, so a typo cannot silently disable it.
 */
function sessionCheckEnabled(env: Env): boolean {
  return String(env.OAUTH_SESSION_CHECK ?? '').toLowerCase() !== 'off';
}

/**
 * Whether the session an access token was minted for is still alive.
 *
 * **The claim is already there.** The authorization server puts the session id in the access token
 * as `sid` — the provider does it at issuance, not us — and the provider's own reference
 * implementation treats a token whose session has ended as inactive for exactly this reason. What
 * was missing was the *read*: the resource server verified the signature and never asked whether
 * the session still existed, so signing out did not stop an agent.
 *
 * **Why the session is the thing to check.** A JWT access token is self-contained: there is no
 * server-side record the resource server could consult to ask "has this been withdrawn?". The
 * session is the one thing in the token that points at mutable server state, and it is exactly the
 * thing a sign-out deletes. The provider says so itself — *"JWT access tokens are self-contained
 * and cannot be revoked server-side"* — and its own validator treats a missing or expired session
 * as inactive.
 *
 * **The `oauthAccessToken.revoked` column is deliberately not read.** It is the stored backstop
 * for opaque tokens, which the provider can look up; for a self-contained JWT it would mean
 * hashing the token with the provider's own hasher and coupling this Worker to that scheme. It
 * would also add nothing today: there is no per-token revoke control in the portal to set it, and
 * the provider revokes a session's tokens on sign-out as hardening anyway. See ADR-0011.
 *
 * **Fails closed.** A database error is not a live session, except inside the grace window — see
 * `SESSION_VERDICT_GRACE_MS`.
 */
async function sessionIsLive(env: Env, sid: string): Promise<boolean> {
  // Unbound means the token could not have been verified in the first place — the signing key
  // lives in the same database — so this is unreachable in practice. It is answered as "not live"
  // rather than as "cannot tell", because the two callers of this function are the same database.
  if (!env.PORTAL_DB) return false;

  const now = Date.now();
  const cached = sessionVerdicts.get(sid);

  // A fresh verdict needs no query.
  if (cached && now - cached.checkedAt < SESSION_VERDICT_TTL_MS) {
    return cached.live;
  }

  try {
    const row = await env.PORTAL_DB
      .prepare('SELECT expires_at FROM session WHERE id = ?')
      .bind(sid)
      .first<{ expires_at: number | null }>();

    // No row: the session was deleted — a sign-out, or a revocation. A row whose expiry has passed
    // is a session better-auth has not reaped yet; it is still not a live session.
    const live = !!row && typeof row.expires_at === 'number' && row.expires_at > now;

    sessionVerdicts.set(sid, { live, checkedAt: now });
    if (sessionVerdicts.size > SESSION_VERDICT_CACHE_MAX) {
      for (const [key, verdict] of sessionVerdicts) {
        if (now - verdict.checkedAt > SESSION_VERDICT_TTL_MS + SESSION_VERDICT_GRACE_MS) {
          sessionVerdicts.delete(key);
        }
        if (sessionVerdicts.size <= SESSION_VERDICT_CACHE_MAX) break;
      }
    }
    return live;
  } catch (error) {
    console.warn(`[oauth] session liveness check failed for ${sid}:`, error);
    // Inside the grace window, a verdict of "live" still stands. Outside it, the answer is no.
    if (cached && cached.live && now - cached.checkedAt < SESSION_VERDICT_TTL_MS + SESSION_VERDICT_GRACE_MS) {
      return true;
    }
    return false;
  }
}

function scopesFrom(payload: JWTPayload): string[] {
  const scope = payload.scope;
  if (typeof scope !== 'string') return [];
  return scope.split(' ').filter(Boolean);
}

/**
 * Verify a bearer token against this deployment's authorization server.
 *
 * `origin` is the request's own origin, so the issuer and audience are the ones this deployment
 * actually uses — production and staging differ, and hard-coding either would make one of them
 * reject every token.
 */
export async function verifyOAuthAccessToken(
  env: Env,
  token: string,
  origin: string
): Promise<OAuthTokenResult> {
  const issuer = `${origin}/api/auth`;
  try {
    const jwks = await jwksFor(env);
    if (!jwks) return { ok: false, reason: 'invalid' };

    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: `${origin}/mcp`,
    });

    const customerId = payload.customer_id;
    if (typeof customerId !== 'string' || !customerId) {
      return { ok: false, reason: 'no_customer' };
    }

    // Session liveness. The `sid` claim is the session the token was minted for; the provider puts
    // it there at issuance. A token with no `sid` — a client-credentials grant, or a token minted
    // before this check existed — is not checked: it still has its own expiry, and refusing tokens
    // we cannot judge would break live clients for no security gain.
    const sid = typeof payload.sid === 'string' && payload.sid ? payload.sid : null;
    if (sid && sessionCheckEnabled(env)) {
      if (!(await sessionIsLive(env, sid))) {
        console.warn('[oauth] access token rejected: the session it was minted for has ended');
        return { ok: false, reason: 'session_ended' };
      }
    }

    return {
      ok: true,
      claims: {
        subject: typeof payload.sub === 'string' ? payload.sub : '',
        customerId,
        scopes: scopesFrom(payload),
        clientId:
          typeof payload.client_id === 'string'
            ? payload.client_id
            : typeof payload.azp === 'string'
              ? payload.azp
              : '',
        expiresAt: typeof payload.exp === 'number' ? payload.exp : undefined,
      },
    };
  } catch (error) {
    // Every jose failure — bad signature, wrong issuer, wrong audience, expired, malformed — is the
    // same answer to a caller: this token is not usable here. Telling a caller *why* would make this
    // an oracle for probing tokens.
    //
    // The reason goes to the log instead, and it has to: the first version of this logged only
    // "rejected", so a token that failed for a fixable reason was indistinguishable from one that
    // was simply invalid. A uniform response is not the same as no diagnosis.
    console.warn(
      `[oauth] access token rejected: ${error instanceof Error ? error.message : String(error)}`
    );
    return { ok: false, reason: 'invalid' };
  }
}
