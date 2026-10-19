import { beforeAll, describe, expect, it } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

import { clearJwksCache, verifyOAuthAccessToken } from '../src/oauth-token';
import type { Env } from '../src/types';

const ORIGIN = 'https://lookup.test';
const ISSUER = `${ORIGIN}/api/auth`;
const AUDIENCE = `${ORIGIN}/mcp`;

let privateKey: CryptoKey;
let env: Env;

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
  const jwk = await exportJWK(pair.publicKey);

  env = {
    PORTAL_DB: {
      prepare: () => ({
        first: async () => ({ id: 'test', public_key: JSON.stringify(jwk), alg: 'RS256' }),
      }),
    },
  } as unknown as Env;
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
