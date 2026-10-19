import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

import { clearJwksCache, clearSessionVerdictCache, verifyOAuthAccessToken } from '../src/oauth-token';
import type { Env } from '../src/types';

const ORIGIN = 'https://lookup.test';
const ISSUER = `${ORIGIN}/api/auth`;
const AUDIENCE = `${ORIGIN}/mcp`;

let privateKey: CryptoKey;
let jwk: Record<string, unknown>;

/**
 * A real keypair, and a portal database that holds its public half the way the real one does.
 *
 * The alternative — a hand-written token and a mocked verifier — would only test that our code agrees
 * with itself. Signing for real is what makes the audience and issuer assertions below mean
 * something: they can only pass if the token is genuinely verified and the claims genuinely checked.
 *
 * The key comes from a stub `PORTAL_DB` rather than a stubbed `fetch`, because that is now where the
 * verifier reads it from: a remote JWKS fetch from inside this Worker does not return 200, which is
 * what made every token fail against the live deployment.
 */
beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  jwk = await exportJWK(pair.publicKey);
});

/** A session row, in the shape the portal's `session` table holds it. */
type SessionRow = { expires_at: number };

/**
 * A portal database that answers the two queries the verifier makes: the signing key, and the
 * session an access token was minted for.
 *
 * The session query can be made to fail, because "what happens when the database is unavailable" is
 * a security decision and not an accident.
 */
function createPortalDb(
  sessions: Map<string, SessionRow>,
  options: { sessionQueryFails?: boolean } = {}
): D1Database {
  return {
    prepare: (sql: string) => {
      if (sql.includes('FROM session')) {
        const statement = {
          bind: (...params: unknown[]) => ({
            first: async () => {
              if (options.sessionQueryFails) throw new Error('D1 is unavailable');
              const row = sessions.get(String(params[0]));
              return row ? { expires_at: row.expires_at } : null;
            },
          }),
        };
        return statement;
      }
      return { first: async () => ({ id: 'test', public_key: JSON.stringify(jwk), alg: 'RS256' }) };
    },
  } as unknown as D1Database;
}

function createEnv(
  sessions: Map<string, SessionRow> = new Map(),
  options: { sessionQueryFails?: boolean; oauthSessionCheck?: string } = {}
): Env {
  return {
    PORTAL_DB: createPortalDb(sessions, options),
    ...(options.oauthSessionCheck ? { OAUTH_SESSION_CHECK: options.oauthSessionCheck } : {}),
  } as unknown as Env;
}

/** A session that is alive for another hour. */
function liveSession(id: string): Map<string, SessionRow> {
  return new Map([[id, { expires_at: Date.now() + 60 * 60 * 1000 }]]);
}

let env: Env;

beforeEach(() => {
  clearJwksCache();
  clearSessionVerdictCache();
  env = createEnv();
});

function token(overrides: {
  audience?: string;
  issuer?: string;
  expiresIn?: string;
  claims?: Record<string, unknown>;
} = {}): Promise<string> {
  return new SignJWT({ customer_id: 'cust_abc', scope: 'ridings:lookup', ...overrides.claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? AUDIENCE)
    .setSubject('user_1')
    .setIssuedAt()
    .setExpirationTime(overrides.expiresIn ?? '5m')
    .sign(privateKey);
}

describe('verifyOAuthAccessToken', () => {
  it('accepts a token minted for this resource, and reads the Customer from the claim', async () => {
    clearJwksCache();
    const result = await verifyOAuthAccessToken(env, await token(), ORIGIN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims.customerId).toBe('cust_abc');
    expect(result.claims.subject).toBe('user_1');
    expect(result.claims.scopes).toEqual(['ridings:lookup']);
  });

  it('refuses a token minted for a different resource', async () => {
    // The RFC 8707 property, and the one that matters most: without it, a token issued for any other
    // service that trusts the same issuer would be accepted here.
    clearJwksCache();
    const result = await verifyOAuthAccessToken(
      env,
      await token({ audience: 'https://other.example/mcp' }),
      ORIGIN
    );
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses a token from a different issuer', async () => {
    clearJwksCache();
    const result = await verifyOAuthAccessToken(
      env,
      await token({ issuer: 'https://elsewhere.example/api/auth' }),
      ORIGIN
    );
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses an expired token', async () => {
    clearJwksCache();
    const result = await verifyOAuthAccessToken(env, await token({ expiresIn: '-1m' }), ORIGIN);
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses a token with no Customer rather than billing nobody', async () => {
    clearJwksCache();
    const result = await verifyOAuthAccessToken(
      env,
      await token({ claims: { customer_id: undefined } }),
      ORIGIN
    );
    expect(result).toEqual({ ok: false, reason: 'no_customer' });
  });

  it('refuses a token that is not a token', async () => {
    clearJwksCache();
    expect(await verifyOAuthAccessToken(env, 'not.a.jwt', ORIGIN)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('does not tell the caller why a token failed', async () => {
    // Every failure is the same answer. Distinguishing "wrong audience" from "bad signature" in the
    // response would make this endpoint an oracle for probing tokens.
    clearJwksCache();
    const wrongAudience = await verifyOAuthAccessToken(env, await token({ audience: 'https://x/mcp' }), ORIGIN);
    const garbage = await verifyOAuthAccessToken(env, 'not.a.jwt', ORIGIN);
    expect(wrongAudience).toEqual(garbage);
  });
});

/**
 * Session liveness — the reason a sign-out stops an agent (ADR-0011).
 *
 * The `sid` claim is put in the access token by the authorization server, not by us: the provider
 * passes `sessionId` at issuance. What was missing was the read, and these tests are what says it
 * is now there.
 */
describe('the session an access token was minted for', () => {
  it('accepts a token whose session is alive', async () => {
    const live = createEnv(liveSession('sess_1'));
    const result = await verifyOAuthAccessToken(live, await token({ claims: { sid: 'sess_1' } }), ORIGIN);
    expect(result.ok).toBe(true);
  });

  it('refuses a token whose session is gone — a sign-out', async () => {
    // No session row: the person signed out, or the session was revoked. This is the case the
    // whole check exists for.
    const signedOut = createEnv(new Map());
    const result = await verifyOAuthAccessToken(signedOut, await token({ claims: { sid: 'sess_1' } }), ORIGIN);
    expect(result).toEqual({ ok: false, reason: 'session_ended' });
  });

  it('refuses a token whose session has expired, even if the row is still there', async () => {
    // better-auth does not reap an expired session the instant it expires, so the row can outlive
    // the session. The expiry is the session's, not the row's.
    const expired = createEnv(new Map([['sess_1', { expires_at: Date.now() - 1000 }]]));
    const result = await verifyOAuthAccessToken(expired, await token({ claims: { sid: 'sess_1' } }), ORIGIN);
    expect(result).toEqual({ ok: false, reason: 'session_ended' });
  });

  it('accepts a token with no session claim at all', async () => {
    // A token minted before this check existed carries no `sid`, and so does a client-credentials
    // grant. Refusing those would break live clients for no security gain — their own expiry still
    // bounds them.
    const result = await verifyOAuthAccessToken(env, await token(), ORIGIN);
    expect(result.ok).toBe(true);
  });

  it('does not consult the session twice for the same request burst', async () => {
    // The verdict is cached briefly, so an agent's tool calls do not each cost a query.
    let queries = 0;
    const counting = {
      PORTAL_DB: {
        prepare: (sql: string) => {
          if (sql.includes('FROM session')) {
            return {
              bind: () => ({
                first: async () => {
                  queries += 1;
                  return { expires_at: Date.now() + 60 * 60 * 1000 };
                },
              }),
            };
          }
          return { first: async () => ({ id: 'test', public_key: JSON.stringify(jwk), alg: 'RS256' }) };
        },
      },
    } as unknown as Env;

    const signed = await token({ claims: { sid: 'sess_1' } });
    await verifyOAuthAccessToken(counting, signed, ORIGIN);
    await verifyOAuthAccessToken(counting, signed, ORIGIN);
    await verifyOAuthAccessToken(counting, signed, ORIGIN);
    expect(queries).toBe(1);
  });

  it('skips the check when it is turned off', async () => {
    // The kill switch, so a deployment that turns out to be wrong can be reversed without shipping
    // code. Anything other than the literal `off` leaves it on.
    const off = createEnv(new Map(), { oauthSessionCheck: 'off' });
    const result = await verifyOAuthAccessToken(off, await token({ claims: { sid: 'sess_1' } }), ORIGIN);
    expect(result.ok).toBe(true);
  });

  it('treats a value that is not `off` as on', async () => {
    // A typo must not silently disable the check.
    const typo = createEnv(new Map(), { oauthSessionCheck: 'false' });
    const result = await verifyOAuthAccessToken(typo, await token({ claims: { sid: 'sess_1' } }), ORIGIN);
    expect(result).toEqual({ ok: false, reason: 'session_ended' });
  });

  it('fails closed when the database cannot be reached', async () => {
    // An unreachable database is not a live session. Failing open here would make a D1 blip an
    // unbounded bypass of the check.
    const broken = createEnv(liveSession('sess_1'), { sessionQueryFails: true });
    const result = await verifyOAuthAccessToken(broken, await token({ claims: { sid: 'sess_1' } }), ORIGIN);
    expect(result).toEqual({ ok: false, reason: 'session_ended' });
  });

  it('keeps a live session working through a short database outage', async () => {
    // A verdict of "live" survives a database error for the grace window, so a D1 blip costs a
    // delayed revocation rather than an outage of every OAuth call.
    let failing = false;
    const flapping = {
      PORTAL_DB: {
        prepare: (sql: string) => {
          if (sql.includes('FROM session')) {
            return {
              bind: () => ({
                first: async () => {
                  if (failing) throw new Error('D1 is unavailable');
                  return { expires_at: Date.now() + 60 * 60 * 1000 };
                },
              }),
            };
          }
          return { first: async () => ({ id: 'test', public_key: JSON.stringify(jwk), alg: 'RS256' }) };
        },
      },
    } as unknown as Env;

    const signed = await token({ claims: { sid: 'sess_1' } });
    const first = await verifyOAuthAccessToken(flapping, signed, ORIGIN);
    expect(first.ok).toBe(true);

    failing = true;
    // The verdict is still inside its TTL, so no query is made at all.
    const cached = await verifyOAuthAccessToken(flapping, signed, ORIGIN);
    expect(cached.ok).toBe(true);
  });
});
