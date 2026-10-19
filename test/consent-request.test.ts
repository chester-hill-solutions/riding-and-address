import { describe, expect, it } from 'vitest';

import { makeSignature } from 'better-auth/crypto';

import { readConsentRequest, verifyOAuthQueryParams } from '../portal/app/lib/consent-request';

/**
 * The consent screen could not be used.
 *
 * The link the authorization server redirects to carries the *authorization request's* own
 * parameters, signed — and no `code`, because the code is issued **after** the consent is
 * accepted. The loader required a `code` anyway, so it refused every real link: a person who
 * followed their agent's authorisation link was told "Nothing to authorise", and the agent
 * could never be authorised at all.
 *
 * The check survived because nothing walked the flow the way a browser does. A script posts to
 * the consent *action*, which never looked at a `code` — so the walk that found the missing
 * `Origin` header on the same screen reported a different failure and this one stayed hidden.
 *
 * These tests drive the loader's own decision: what it accepts, and what it refuses.
 */
const SECRET = 'consent-request-test-secret';

/**
 * The provider's canonical form: every entry, sorted by key and then by value.
 *
 * The provider does not export this, so the test reproduces it — and then proves the
 * reproduction valid against the provider's own checker before relying on it. If the provider's
 * scheme ever changes, this fails loudly at the "the provider accepts it" assertion rather than
 * quietly meaning something else.
 */
function canonicalize(params: URLSearchParams): string {
  const entries = [...params.entries()].sort(([keyA, valueA], [keyB, valueB]) => {
    if (keyA < keyB) return -1;
    if (keyA > keyB) return 1;
    if (valueA < valueB) return -1;
    if (valueA > valueB) return 1;
    return 0;
  });
  const canonical = new URLSearchParams();
  for (const [key, value] of entries) canonical.append(key, value);
  return canonical.toString();
}

/**
 * Sign a query the way the provider signs it: the parameters, an expiry, an issue time, the
 * list of signed parameter names, and an HMAC over the canonical form of all of it.
 *
 * An `exp` already on the parameters is left alone — the expiry is part of what the signature
 * covers, so it cannot be changed afterwards without invalidating the signature, and a test of
 * the expiry branch has to sign an already-expired query.
 */
async function signQuery(params: URLSearchParams, secret = SECRET): Promise<string> {
  if (!params.has('exp')) {
    params.set('exp', String(Math.floor(Date.now() / 1000) + 600));
  }
  params.set('ba_iat', String(Date.now()));

  const signedNames = [...new Set([...params.keys(), 'ba_param'])].sort();
  params.delete('ba_param');
  for (const name of signedNames) params.append('ba_param', name);

  params.set('sig', await makeSignature(canonicalize(params), secret));
  return params.toString();
}

/** The parameters of a real authorization request, as the provider forwards them. */
function authorizationParams(): URLSearchParams {
  return new URLSearchParams({
    client_id: 'https://opencode.ai/oauth/opencode/client.json',
    redirect_uri: 'http://127.0.0.1/callback',
    response_type: 'code',
    code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    code_challenge_method: 'S256',
    scope: 'ridings:lookup ridings:area openid profile',
    state: 'a-state-value',
    resource: 'https://cancoder.chesterhillsolutions.ca/mcp',
  });
}

describe('the consent request a link carries', () => {
  it('is accepted without a code, because the code is issued after the consent', async () => {
    const query = await signQuery(authorizationParams());

    // The link a real authorization request produces. There is no `code` in it, and there must
    // not be: the code does not exist until the consent is accepted.
    expect(new URLSearchParams(query).get('code')).toBeNull();

    // The provider's own checker agrees the query is one it issued, so the test's signing is
    // valid and the assertion below is about the portal, not about the test.
    expect(await verifyOAuthQueryParams(query, SECRET)).toBe(true);

    const consent = await readConsentRequest(query, SECRET);
    expect(consent).not.toBeNull();
    expect(consent?.clientId).toBe('https://opencode.ai/oauth/opencode/client.json');
    expect(consent?.scopes).toEqual(['ridings:lookup', 'ridings:area', 'openid', 'profile']);
  });

  it('refuses a link whose client was swapped for another', async () => {
    const query = await signQuery(authorizationParams());
    const tampered = new URLSearchParams(query);
    tampered.set('client_id', 'https://attacker.example/client.json');

    expect(await verifyOAuthQueryParams(tampered.toString(), SECRET)).toBe(false);
    expect(await readConsentRequest(tampered.toString(), SECRET)).toBeNull();
  });

  it('refuses a link whose scopes were widened', async () => {
    const query = await signQuery(authorizationParams());
    const tampered = new URLSearchParams(query);
    tampered.set('scope', 'ridings:lookup ridings:area admin:everything');

    expect(await verifyOAuthQueryParams(tampered.toString(), SECRET)).toBe(false);
    expect(await readConsentRequest(tampered.toString(), SECRET)).toBeNull();
  });

  it('refuses an unsigned link', async () => {
    const unsigned = authorizationParams().toString();

    expect(await verifyOAuthQueryParams(unsigned, SECRET)).toBe(false);
    expect(await readConsentRequest(unsigned, SECRET)).toBeNull();
  });

  it('refuses a link signed with a different secret', async () => {
    const query = await signQuery(authorizationParams(), 'a-different-secret');

    expect(await verifyOAuthQueryParams(query, SECRET)).toBe(false);
    expect(await readConsentRequest(query, SECRET)).toBeNull();
  });

  it('refuses an expired link', async () => {
    const params = authorizationParams();
    params.set('exp', String(Math.floor(Date.now() / 1000) - 1));
    const query = await signQuery(params);

    expect(await verifyOAuthQueryParams(query, SECRET)).toBe(false);
    expect(await readConsentRequest(query, SECRET)).toBeNull();
  });

  it('refuses everything when there is no secret to verify with', async () => {
    const query = await signQuery(authorizationParams());

    // Failing closed. A consent screen that displays an unverified request is worse than one
    // that displays nothing.
    expect(await readConsentRequest(query, '')).toBeNull();
  });

  it('refuses a signed link that names no client', async () => {
    const params = authorizationParams();
    params.delete('client_id');
    const query = await signQuery(params);

    expect(await readConsentRequest(query, SECRET)).toBeNull();
  });
});
