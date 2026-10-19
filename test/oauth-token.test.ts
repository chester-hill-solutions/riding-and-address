import { beforeAll, describe, expect, it } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

import { clearJwksCache, verifyOAuthAccessToken } from '../src/oauth-token';

const ORIGIN = 'https://lookup.test';
const ISSUER = `${ORIGIN}/api/auth`;
const AUDIENCE = `${ORIGIN}/mcp`;

let privateKey: CryptoKey;
const originalFetch = globalThis.fetch;

/**
 * A real keypair and a stubbed JWKS endpoint.
 *
 * The alternative — a hand-written token and a mocked verifier — would test that our code agrees
 * with itself. Signing for real and serving the matching JWKS is what makes the audience and issuer
 * assertions below mean something: they can only pass if the token is genuinely verified and the
 * claims genuinely checked.
 */
beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === `${ISSUER}/jwks`) {
      return new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'test', alg: 'RS256', use: 'sig' }] }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return originalFetch(input as RequestInfo);
  }) as typeof fetch;
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
    const result = await verifyOAuthAccessToken(await token(), ORIGIN);
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
      await token({ audience: 'https://other.example/mcp' }),
      ORIGIN
    );
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses a token from a different issuer', async () => {
    clearJwksCache();
    const result = await verifyOAuthAccessToken(
      await token({ issuer: 'https://elsewhere.example/api/auth' }),
      ORIGIN
    );
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses an expired token', async () => {
    clearJwksCache();
    const result = await verifyOAuthAccessToken(await token({ expiresIn: '-1m' }), ORIGIN);
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses a token with no Customer rather than billing nobody', async () => {
    clearJwksCache();
    const result = await verifyOAuthAccessToken(
      await token({ claims: { customer_id: undefined } }),
      ORIGIN
    );
    expect(result).toEqual({ ok: false, reason: 'no_customer' });
  });

  it('refuses a token that is not a token', async () => {
    clearJwksCache();
    expect(await verifyOAuthAccessToken('not.a.jwt', ORIGIN)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('does not tell the caller why a token failed', async () => {
    // Every failure is the same answer. Distinguishing "wrong audience" from "bad signature" in the
    // response would make this endpoint an oracle for probing tokens.
    clearJwksCache();
    const wrongAudience = await verifyOAuthAccessToken(await token({ audience: 'https://x/mcp' }), ORIGIN);
    const garbage = await verifyOAuthAccessToken('not.a.jwt', ORIGIN);
    expect(wrongAudience).toEqual(garbage);
  });
});
