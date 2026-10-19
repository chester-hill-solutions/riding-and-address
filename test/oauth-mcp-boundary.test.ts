import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

import { clearApiKeyCache, putServerKey } from '../src/api-keys';
import { geoCacheLRU, spatialIndexCacheLRU } from '../src/cache';
import { clearCustomerCache, putCustomer, type CustomerPlan } from '../src/customer';
import { clearJwksCache } from '../src/oauth-token';
import { fakeUsageNamespace } from './helpers/fake-usage-do';
import { createLookupTestEnv, TORONTO_LAT, TORONTO_LON } from './helpers/lookup-test-env';
import type { Env } from '../src/types';

/**
 * The Worker-to-tool authorization boundary, where two things were wrong.
 *
 * **#205** — an OAuth-authenticated lookup discarded the Customer it was billed against, so it
 * skipped the monthly ledger, the monthly hard fuse and the Stripe meter. The rate limits did not
 * notice: they are minute-window counters, and this was the monthly one. An account's own fuse
 * was the only thing that could have stopped it.
 *
 * **#206** — the token's scopes were read off the token and then dropped, so a token holding only
 * `ridings:area` ran a lookup it was never granted.
 *
 * These drive the real Worker over HTTP with a real signed token, so the claims are genuinely
 * verified and the boundary is genuinely crossed. A mocked verifier would only prove that our code
 * agrees with itself.
 *
 * The ledger is asserted by its *effect* — a Customer with a fuse of one accepts exactly one
 * Billable unit and refuses the next — rather than by reading the counter's internals. That is
 * the property the acceptance asks for: that both credential types spend the same allowance.
 */

const ORIGIN = 'https://lookup.test';
const ISSUER = `${ORIGIN}/api/auth`;
const AUDIENCE = `${ORIGIN}/mcp`;
const CUSTOMER_ID = 'cust_acme';
const PRM_URL = `${ORIGIN}/.well-known/oauth-protected-resource/mcp`;
const SERVER_KEY = 'sk_live_test_server_key_for_the_boundary';

let privateKey: CryptoKey;
let publicJwk: Awaited<ReturnType<typeof exportJWK>>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  publicJwk = await exportJWK(pair.publicKey);
});

beforeEach(() => {
  clearApiKeyCache();
  clearCustomerCache();
  clearJwksCache();
  // The dataset caches are module-level, so a lookup in one test can otherwise answer from an
  // index another test's environment built. The integration test clears them for the same reason.
  geoCacheLRU.clear();
  spatialIndexCacheLRU.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A KV namespace in memory, with the JSON access the real one has. */
function memoryKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string, type?: 'text' | 'json') => {
      const value = store.get(key);
      if (value === undefined) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
  } as unknown as KVNamespace;
}

async function makeEnv(
  options: { plan?: CustomerPlan; fuseLimit?: number; stripe?: boolean } = {}
): Promise<Env> {
  const env = createLookupTestEnv() as Env;
  env.API_KEYS = memoryKv();
  env.API_KEY_USAGE = fakeUsageNamespace();
  env.PUBLIC_API_BASE_URL = ORIGIN;
  env.RATE_LIMIT = 10_000;
  env.DEMO_RATE_LIMIT = '10000';
  env.FREE_MONTHLY_ALLOWANCE = '1000';
  if (options.stripe) env.STRIPE_SECRET_KEY = 'sk_test_meter';
  env.PORTAL_DB = {
    prepare: () => ({
      first: async () => ({ id: 'test', public_key: JSON.stringify(publicJwk), alg: 'RS256' }),
    }),
  } as unknown as D1Database;

  await putCustomer(env, {
    id: CUSTOMER_ID,
    plan: options.plan ?? 'free',
    fuseLimit: options.fuseLimit ?? 1000,
    ...(options.stripe ? { stripeCustomerId: 'cus_test' } : {}),
  });
  return env;
}

function token(overrides: { scope?: string | null } = {}): Promise<string> {
  const claims: Record<string, unknown> = { customer_id: CUSTOMER_ID, client_id: 'client_test' };
  if (overrides.scope !== null) claims.scope = overrides.scope ?? 'ridings:lookup';
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject('user_1')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

/** The stateless MCP handler answers with SSE; pull the JSON-RPC payload out of it. */
function parseRpc(text: string): {
  result?: { isError?: boolean; structuredContent?: Record<string, unknown> };
} {
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  if (!line) throw new Error(`No SSE data line in: ${text.slice(0, 300)}`);
  return JSON.parse(line.slice('data: '.length));
}

async function callMcp(
  env: Env,
  headers: Record<string, string>,
  args: Record<string, unknown> = { latitude: TORONTO_LAT, longitude: TORONTO_LON },
  tool = 'lookup_riding'
): Promise<{ response: Response; tasks: Promise<unknown>[] }> {
  const worker = (await import('../src/worker')).default;
  const tasks: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (task: Promise<unknown>) => {
      tasks.push(task);
    },
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext;

  const request = new Request(`${ORIGIN}/mcp`, {
    method: 'POST',
    headers: {
      host: 'lookup.test',
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: tool, arguments: args },
    }),
  });

  return { response: await worker.fetch(request, env, ctx), tasks };
}

/** The tool's structured error code, whatever the HTTP status was. */
async function toolErrorCode(response: Response): Promise<string | undefined> {
  if (response.status !== 200) return undefined;
  const rpc = parseRpc(await response.text());
  const error = rpc.result?.structuredContent?.error as { code?: string } | undefined;
  return error?.code;
}

describe('the OAuth path bills the Customer it was issued for (#205)', () => {
  it('spends exactly one unit of the monthly allowance on an OAuth lookup', async () => {
    // A fuse of one: the first Billable unit is allowed and the second is refused, so the test
    // measures the ledger rather than trusting that a call happened.
    const env = await makeEnv({ fuseLimit: 1 });

    const first = await callMcp(env, { authorization: `Bearer ${await token()}` });
    expect(first.response.status).toBe(200);
    expect(parseRpc(await first.response.text()).result?.structuredContent?.ok).toBe(true);

    const second = await callMcp(env, { authorization: `Bearer ${await token()}` });
    expect(await toolErrorCode(second.response)).toBe('FUSE_EXCEEDED');
  });

  it('spends the same allowance a Server key spends, and refuses at the same boundary', async () => {
    // The point of the issue: the OAuth token and the Server key must spend ONE allowance, not
    // two. A fuse of two accepts one OAuth lookup and one Server-key lookup, and refuses the third.
    const env = await makeEnv({ fuseLimit: 2 });
    await putServerKey(env, SERVER_KEY, { id: 'key_1', customerId: CUSTOMER_ID, label: 'test', dailyLimit: 0 });

    const viaToken = await callMcp(env, { authorization: `Bearer ${await token()}` });
    expect(viaToken.response.status).toBe(200);
    expect(parseRpc(await viaToken.response.text()).result?.structuredContent?.ok).toBe(true);

    const viaKey = await callMcp(env, { authorization: `Bearer ${SERVER_KEY}` });
    expect(viaKey.response.status).toBe(200);
    expect(parseRpc(await viaKey.response.text()).result?.structuredContent?.ok).toBe(true);

    // Both units are spent, so a third call — whichever credential it uses — is refused.
    const third = await callMcp(env, { authorization: `Bearer ${await token()}` });
    expect(await toolErrorCode(third.response)).toBe('FUSE_EXCEEDED');
  });

  it('reports one Stripe meter event for a metered Customer, and not two', async () => {
    const env = await makeEnv({ plan: 'metered', fuseLimit: 100, stripe: true });
    const meterCalls: string[] = [];
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      if (url.includes('api.stripe.com')) {
        meterCalls.push(url);
        return new Response('{}', { status: 200 });
      }
      return realFetch(input as RequestInfo, init);
    }) as typeof fetch);

    const { response, tasks } = await callMcp(env, { authorization: `Bearer ${await token()}` });
    expect(response.status).toBe(200);
    // The tool succeeded, not merely the transport: a tool error is also a 200, and a lookup
    // that failed would not have reached the meter at all.
    expect(parseRpc(await response.clone().text()).result?.structuredContent?.ok).toBe(true);
    await Promise.all(tasks);

    expect(meterCalls.filter((url) => url.includes('/billing/meter_events'))).toHaveLength(1);
  });

  it('leaves the keyless demo tier unbilled', async () => {
    // The demo tier is how an agent discovers this service. It must keep working, and it must
    // keep not spending the account's allowance.
    const env = await makeEnv({ fuseLimit: 1 });

    const anonymous = await callMcp(env, {});
    expect(anonymous.response.status).toBe(200);
    expect(parseRpc(await anonymous.response.text()).result?.structuredContent?.ok).toBe(true);

    // The demo call consumed nothing, so the account's one unit is still there.
    const viaToken = await callMcp(env, { authorization: `Bearer ${await token()}` });
    expect(viaToken.response.status).toBe(200);
    const second = await callMcp(env, { authorization: `Bearer ${await token()}` });
    expect(await toolErrorCode(second.response)).toBe('FUSE_EXCEEDED');
  });
});

describe('the OAuth path enforces the token\'s scopes (#206)', () => {
  it('runs the lookup when the token carries ridings:lookup', async () => {
    const env = await makeEnv();
    const { response } = await callMcp(env, { authorization: `Bearer ${await token()}` });
    expect(response.status).toBe(200);
    expect(parseRpc(await response.text()).result?.structuredContent?.ok).toBe(true);
  });

  it('refuses a token that carries only ridings:area, without running or billing a lookup', async () => {
    // A lookup is half a cent and an area search can be eight dollars. One approval must not
    // quietly authorise both, so the scopes are not a hierarchy — and the refusal has to happen
    // before the tool runs, not after.
    const env = await makeEnv({ fuseLimit: 1 });

    const refused = await callMcp(env, { authorization: `Bearer ${await token({ scope: 'ridings:area' })}` });
    expect(refused.response.status).toBe(403);
    const challenge = refused.response.headers.get('www-authenticate') ?? '';
    expect(challenge).toContain('error="insufficient_scope"');
    expect(challenge).toContain('scope="ridings:lookup"');
    expect(challenge).toContain(`resource_metadata="${PRM_URL}"`);

    // Nothing was spent: the account's single unit is still there, so a properly-scoped call
    // succeeds and the call after that is the one the fuse refuses.
    const scoped = await callMcp(env, { authorization: `Bearer ${await token()}` });
    expect(scoped.response.status).toBe(200);
    expect(parseRpc(await scoped.response.text()).result?.structuredContent?.ok).toBe(true);

    const afterOne = await callMcp(env, { authorization: `Bearer ${await token()}` });
    expect(await toolErrorCode(afterOne.response)).toBe('FUSE_EXCEEDED');
  });

  it('refuses a token that carries no scope at all', async () => {
    const env = await makeEnv();
    const { response } = await callMcp(env, {
      authorization: `Bearer ${await token({ scope: null })}`,
    });
    expect(response.status).toBe(403);
    expect(response.headers.get('www-authenticate')).toContain('error="insufficient_scope"');
  });

  it('refuses a token that carries an unrelated scope', async () => {
    const env = await makeEnv();
    const { response } = await callMcp(env, {
      authorization: `Bearer ${await token({ scope: 'some:other:scope' })}`,
    });
    expect(response.status).toBe(403);
  });

  it('does not challenge a Server key, which has no OAuth scopes to check', async () => {
    // A Server key is the account's own credential, and it is not an OAuth grant. Leaving it
    // working exactly as before is the point: the scope split is about what a *grant* authorises.
    const env = await makeEnv();
    await putServerKey(env, SERVER_KEY, { id: 'key_1', customerId: CUSTOMER_ID, label: 'test', dailyLimit: 0 });

    const { response } = await callMcp(env, { authorization: `Bearer ${SERVER_KEY}` });
    expect(response.status).toBe(200);
    expect(parseRpc(await response.text()).result?.structuredContent?.ok).toBe(true);
  });

  it('still refuses a token that is not usable here, with a challenge rather than prose', async () => {
    const env = await makeEnv();
    const { response } = await callMcp(env, { authorization: 'Bearer not.a.jwt' });
    expect(response.status).toBe(401);
    const challenge = response.headers.get('www-authenticate') ?? '';
    expect(challenge).toContain(`resource_metadata="${PRM_URL}"`);
    expect(challenge).toContain('scope="ridings:lookup"');
  });

  it('refuses a token minted for a different audience, at the Worker', async () => {
    // The RFC 8707 property, and the one that matters most: without it, a token issued for any
    // other service that trusts the same issuer would be accepted here. The verifier's own test
    // covers the property; this covers the answer the caller gets.
    const env = await makeEnv();
    const wrongAudience = await new SignJWT({ customer_id: CUSTOMER_ID, scope: 'ridings:lookup' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(ISSUER)
      .setAudience('https://other.example/mcp')
      .setSubject('user_1')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    const { response } = await callMcp(env, { authorization: `Bearer ${wrongAudience}` });
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain(`resource_metadata="${PRM_URL}"`);
  });

  it('leaves the free quote tool open to an under-scoped token', async () => {
    // The scope requirement belongs to the lookup, not to the endpoint. A token that cannot look
    // up can still ask for a free, expiring quote — quoting consumes no billable usage and needs
    // no key, so a scope check there would be charging for a decision the API already made free.
    const env = await makeEnv();
    env.OFFER_SIGNING_SECRET = 'test-signing-secret';
    const { response } = await callMcp(
      env,
      { authorization: `Bearer ${await token({ scope: 'ridings:area' })}` },
      { latitude: TORONTO_LAT, longitude: TORONTO_LON },
      'quote_lookup'
    );
    expect(response.status).toBe(200);
    expect(parseRpc(await response.text()).result?.structuredContent?.ok).toBe(true);
  });
});
