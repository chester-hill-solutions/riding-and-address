import { beforeEach, describe, expect, it } from 'vitest';
import { makeSignature } from 'better-auth/crypto';

import { loader } from '../app/routes/consent';
import { createPortalDb, portalTestEnv, withPortalEnv, type PortalDb } from './helpers/portal-db';

/**
 * The consent screen's loader.
 *
 * **The consent screen could not be used at all, and the loader is where that happened.**
 *
 * The link the authorization server redirects to carries the authorization request's own
 * parameters, signed, and **no `code`** — the code is issued after the consent is accepted, so
 * there is nothing to redeem at this point. The loader required a `code` anyway, so it refused
 * every real link: a person following their agent's authorisation link was told "Nothing to
 * authorise" for a request the provider had just signed, and the agent could never be authorised.
 *
 * The signature check survived that because nothing walked the flow the way a browser does. These
 * tests drive the *loader* — the thing a person sees — rather than the module that reads the
 * query, so a change that breaks the screen fails here.
 *
 * `test/consent-request.test.ts` covers the query reader itself with eight cases; these cover
 * what the route does with the answer.
 */

const SECRET = 'consent-loader-test-secret';

let portalDb: PortalDb;

beforeEach(() => {
  portalDb = createPortalDb();
});

function env() {
  return portalTestEnv(portalDb, { AUTH_SECRET: SECRET });
}

/**
 * The provider's canonical form: every entry, sorted by key and then by value.
 *
 * Reproduced rather than imported — the provider does not export it — and proven valid by
 * `test/consent-request.test.ts`, which checks the same reproduction against the provider's own
 * checker. A change to the provider's scheme fails there loudly.
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

/** Sign a query the way the provider signs it. */
async function signQuery(params: URLSearchParams, secret = SECRET): Promise<string> {
  if (!params.has('exp')) params.set('exp', String(Math.floor(Date.now() / 1000) + 600));
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

async function load(query: string) {
  const request = new Request(`https://portal.test/consent?${query}`);
  return withPortalEnv(env(), () =>
    loader({ request, params: {}, context: {} as never } as never)
  );
}

describe('the consent loader', () => {
  it('refuses a link that is not one this deployment issued', async () => {
    const result = (await load(authorizationParams().toString())) as { state: string; invalid?: string };

    expect(result.state).toBe('invalid');
    // The message has to be actionable: the person is here because an application sent them, and
    // the answer they need is "ask it to start again".
    expect(result.invalid).toMatch(/no longer valid/i);
    expect(result.invalid).toMatch(/start the connection again/i);
  });

  it('refuses a link whose client was swapped for another', async () => {
    // The client name on the screen comes from these parameters, so a link with a tampered
    // client_id would put a different application's name in front of a person deciding whether to
    // trust it.
    const query = await signQuery(authorizationParams());
    const tampered = new URLSearchParams(query);
    tampered.set('client_id', 'https://attacker.example/client.json');

    const result = (await load(tampered.toString())) as { state: string };
    expect(result.state).toBe('invalid');
  });

  it('refuses a link whose scopes were widened', async () => {
    const query = await signQuery(authorizationParams());
    const tampered = new URLSearchParams(query);
    tampered.set('scope', 'ridings:lookup ridings:area admin:everything');

    const result = (await load(tampered.toString())) as { state: string };
    expect(result.state).toBe('invalid');
  });

  it('sends a signed-in-less visitor to sign in, keeping the request', async () => {
    // The link is genuine but nobody is signed in. The visitor has to be sent to sign in and come
    // back to *this* request — without the query they would consent to nothing and the client
    // would have to start over.
    const query = await signQuery(authorizationParams());
    const result = (await load(query)) as Response;

    expect(result.status).toBe(302);
    const location = new URL(result.headers.get('location') ?? '', 'https://portal.test');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('continue')).toBe(`/consent?${query}`);
  });

  it('does not treat a missing code as a broken link', async () => {
    // The regression, stated directly: a real consent link carries no `code`, and the loader must
    // not refuse it for that.
    const query = await signQuery(authorizationParams());
    expect(new URLSearchParams(query).get('code')).toBeNull();

    const result = (await load(query)) as Response;
    // It got past the signature check — which is what "not refused for a missing code" means.
    // A refusal would be the invalid state; the redirect to sign in is the next step.
    expect(result.status).toBe(302);
  });
});
