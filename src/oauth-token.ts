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
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export interface OAuthTokenClaims {
  /** The user the token was issued to. */
  subject: string;
  /** The Customer whose allowance and meter the call is billed against. */
  customerId: string;
  /** Scopes granted, as a list. */
  scopes: string[];
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
 * One JWKS client per URL, per isolate.
 *
 * `createRemoteJWKSet` does its own caching and cooldown, so this map exists only to avoid rebuilding
 * the client — and its cache — on every request. Keyed by URL because the issuer differs between
 * production and staging, and a request can be served by an isolate that has seen both.
 */
const jwksClients = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(url: string): ReturnType<typeof createRemoteJWKSet> {
  let client = jwksClients.get(url);
  if (!client) {
    client = createRemoteJWKSet(new URL(url));
    jwksClients.set(url, client);
  }
  return client;
}

/** Test seam: drop the cached JWKS clients. */
export function clearJwksCache(): void {
  jwksClients.clear();
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
  token: string,
  origin: string
): Promise<OAuthTokenResult> {
  const issuer = `${origin}/api/auth`;
  try {
    const { payload } = await jwtVerify(token, jwksFor(`${issuer}/jwks`), {
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
      },
    };
  } catch {
    // Every jose failure — bad signature, wrong issuer, wrong audience, expired, malformed — is the
    // same answer to a caller: this token is not usable here. The distinction is in the logs, not in
    // the response, because telling a caller *why* a token failed is a probing oracle.
    console.warn('[oauth] access token rejected');
    return { ok: false, reason: 'invalid' };
  }
}
