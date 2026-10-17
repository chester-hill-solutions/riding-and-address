import { describe, it, expect } from 'vitest';
import { createCanCoderMcpHandler } from '../src/mcp';
import { createRouteContext } from '../src/route-context';
import {
  PURCHASE_INPUT_KEY,
  accountSummary,
  createPurchaseCodec,
  purchaseMessage,
  purchaseUrl,
} from '../src/mcp-purchase';
import { createLookupTestEnv } from './helpers/lookup-test-env';
import type { Env } from '../src/types';

/**
 * The human path: an MCP client that supports elicitation is asked to open a URL, and on re-entry the
 * server reports the *account* rather than believing anything the client says.
 *
 * The flow is a multi-round trip, which on protocol revision 2026-07-28 means a modern client: the
 * request carries routable headers and `_meta` capability declarations, not a session.
 */

const MOCK_CTX = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;

const SECRET = 'a'.repeat(64);

function envWith(overrides: Partial<Env> = {}): Env {
  return {
    ...createLookupTestEnv(),
    PUBLIC_API_HOSTS: 'lookup.test',
    OFFER_SIGNING_SECRET: SECRET,
    ...overrides,
  } as unknown as Env;
}

interface CallResult {
  status: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

/** Call a tool as a modern (2026-07-28) client that declares elicitation. */
async function callPurchase(
  env: Env,
  params: Record<string, unknown>,
  options: { elicitation?: boolean; auth?: unknown } = {}
): Promise<CallResult> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2026-07-28',
    'Mcp-Method': 'tools/call',
    'Mcp-Name': 'purchase',
  };
  const request = new Request('https://lookup.test/mcp', { method: 'POST', headers });
  const routeContext = createRouteContext({
    request,
    env,
    ctx: MOCK_CTX,
    correlationId: 'test-correlation',
    startTime: Date.now(),
  });
  const handler = createCanCoderMcpHandler({
    request,
    routeContext,
    lookupRiding: async () => ({ properties: null }),
    auth: (options.auth ?? null) as never,
  });

  const rpc = new Request('https://lookup.test/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'purchase',
        arguments: {},
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'probe', version: '1' },
          'io.modelcontextprotocol/clientCapabilities': options.elicitation === false ? {} : { elicitation: { url: {} } },
        },
      },
    }),
  });

  const response = await handler.fetch(rpc);
  const text = await response.text();
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  const body = line ? JSON.parse(line.slice('data: '.length)) : JSON.parse(text);
  return { status: response.status, result: body.result, error: body.error };
}

describe('the purchase hand-off module', () => {
  it('sends an anonymous caller to sign up and an authenticated one to their keys', () => {
    expect(purchaseUrl('https://cancoder.test', false)).toBe('https://cancoder.test/signup');
    expect(purchaseUrl('https://cancoder.test', true)).toBe('https://cancoder.test/app/keys');
  });

  it('says nothing has been charged, in both cases', () => {
    expect(purchaseMessage(false)).toMatch(/nothing has been charged/i);
    expect(purchaseMessage(true)).toMatch(/nothing has been charged/i);
  });

  it('reports the account from the server, not from the caller', () => {
    expect(accountSummary(null).authenticated).toBe(false);
    expect(accountSummary({ ok: false, reason: 'KEY_REQUIRED' }).authenticated).toBe(false);
    const authed = accountSummary({ ok: true, customer: { id: 'cus_1' } } as never);
    expect(authed.authenticated).toBe(true);
    expect(authed.summary).toContain('cus_1');
  });

  it('refuses to build a codec from a secret shorter than 256 bits', () => {
    // The codec throws below that length, and a misconfigured secret must not take down the server.
    expect(createPurchaseCodec(undefined)).toBeNull();
    expect(createPurchaseCodec('short')).toBeNull();
    expect(createPurchaseCodec(SECRET)).not.toBeNull();
  });
});

describe('the purchase tool', () => {
  it('asks an elicitation-capable client to open our URL, and signs the state', async () => {
    const { result } = await callPurchase(envWith(), {});

    expect(result).toBeTruthy();
    // A multi-round-trip result carries the embedded request rather than a tool payload.
    const serialised = JSON.stringify(result);
    expect(serialised).toContain('https://lookup.test/signup');
    expect(serialised).toContain('elicitation/create');
    // The state is signed, and carries no secret: the client can read it.
    expect(serialised).toContain('v1.');
  });

  it('refuses to ask a client that cannot handle elicitation, rather than failing oddly', async () => {
    const { result, error } = await callPurchase(envWith(), {}, { elicitation: false });
    // The SDK fails closed, naming the exact capability the client lacks — and it is URL mode
    // specifically, not elicitation in general.
    const serialised = JSON.stringify(result ?? error);
    expect(serialised).toMatch(/capabilit/i);
    expect(serialised).toContain('elicitation');
  });

  it('reports the account state on re-entry, and never claims a payment happened', async () => {
    const env = envWith();
    const first = await callPurchase(env, {});
    const state = JSON.stringify(first.result).match(/"requestState":"([^"]+)"/)?.[1];
    expect(state).toBeTruthy();

    // The client comes back having shown the human the page. Its response says only that.
    const second = await callPurchase(env, {
      inputResponses: { [PURCHASE_INPUT_KEY]: { action: 'accept' } },
      requestState: state,
    });

    expect(second.result?.isError).toBeFalsy();
    const output = second.result?.structuredContent as
      | { ok: boolean; account: { authenticated: boolean }; summary: string }
      | undefined;
    expect(output?.ok).toBe(true);
    // Anonymous: nothing changed, and we say so rather than pretending the purchase landed.
    expect(output?.account.authenticated).toBe(false);
    expect(output?.summary).toMatch(/demo tier/i);
  });

  it('reports an authenticated account as authenticated', async () => {
    const env = envWith();
    const first = await callPurchase(env, {}, { auth: { ok: true, customer: { id: 'cus_42' } } });
    const state = JSON.stringify(first.result).match(/"requestState":"([^"]+)"/)?.[1];

    const second = await callPurchase(
      env,
      { inputResponses: { [PURCHASE_INPUT_KEY]: { action: 'accept' } }, requestState: state },
      { auth: { ok: true, customer: { id: 'cus_42' } } }
    );

    const output = second.result?.structuredContent as
      | { account: { authenticated: boolean }; summary: string }
      | undefined;
    expect(output?.account.authenticated).toBe(true);
    expect(output?.summary).toContain('cus_42');
  });

  it('refuses a tampered requestState', async () => {
    const env = envWith();
    const first = await callPurchase(env, {});
    const state = JSON.stringify(first.result).match(/"requestState":"([^"]+)"/)?.[1] as string;
    const [version, body, mac] = state.split('.');
    const forged = `${version}.${body}.${mac.slice(0, -2)}xx`;

    const second = await callPurchase(env, {
      inputResponses: { [PURCHASE_INPUT_KEY]: { action: 'accept' } },
      requestState: forged,
    });

    // The seam refuses before the handler runs, so nothing is reported as complete.
    expect(second.error?.code ?? 0).toBeLessThan(0);
  });
});
