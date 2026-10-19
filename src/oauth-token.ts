/**
 * Verifying an OAuth access token issued by our own authorization server.
 *
 * The token is a JWT signed by the portal's Better Auth instance, verified against its JWKS. Three
 * things are checked beyond the signature, and each of them is load-bearing:
 *
 *   - **the issuer** (`iss`), so a token minted by some other authorization server is not accepted;
 *   - **the audience** (`aud`), so a token minted for a *different* resource is not accepted — this
 *     is the whole point of RFC 8707 resource binding, and skipping it is how a token for one
 *     service becomes a token for every service that trusts the same issuer;
 *   - **the expiry**, which `jwtVerify` enforces.
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
  | 'no_customer';

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
