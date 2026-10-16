import { describe, it, expect } from 'vitest';
import { createCanCoderMcpHandler } from '../src/mcp';
import { createRouteContext } from '../src/route-context';
import { createLookupTestEnv } from './helpers/lookup-test-env';
import type { Env } from '../src/types';

/**
 * The agent journey needs a quote over MCP, not just raw HTTP. `quote_lookup` wraps the same
 * `/api/quote` handler the REST surface uses, so the two cannot disagree about a valid request or
 * about the price.
 */

const MOCK_CTX = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;

function parseRpc(text: string): {
  result?: { isError?: boolean; structuredContent?: Record<string, unknown> };
} {
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  if (!line) throw new Error(`No SSE data line in: ${text.slice(0, 200)}`);
  return JSON.parse(line.slice('data: '.length));
}

async function callQuote(env: Env, args: Record<string, unknown>) {
  const request = new Request('https://lookup.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
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
    auth: null,
  });
  const rpc = new Request('https://lookup.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'quote_lookup', arguments: args },
    }),
  });
  const response = await handler.fetch(rpc);
  return parseRpc(await response.text()).result ?? {};
}

const envWith = (overrides: Partial<Env> = {}): Env =>
  ({ ...createLookupTestEnv(), OFFER_SIGNING_SECRET: 'test-secret', ...overrides }) as unknown as Env;

describe('quote_lookup MCP tool', () => {
  it('returns a signed offer for a valid lookup', async () => {
    const result = await callQuote(envWith(), { location: 'K1A 0A6' });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.ok).toBe(true);
    const offer = result.structuredContent?.offer as {
      offerId?: string;
      price?: { maximum?: number };
      scope?: { datasetYear?: number };
    };
    expect(offer.offerId).toBeTruthy();
    expect(offer.scope?.datasetYear).toBe(2024);
    expect(typeof offer.price?.maximum).toBe('number');
  });

  it('quotes a provincial dataset when asked', async () => {
    const result = await callQuote(envWith(), { location: 'M5V 2T6', dataset: 'on' });
    const offer = result.structuredContent?.offer as { scope?: { datasetYear?: number } };
    expect(offer.scope?.datasetYear).toBe(2022);
  });

  it('codes a bad tool call as INVALID_ARGUMENT', async () => {
    const result = await callQuote(envWith(), { location: 'K1A 0A6', latitude: 45, longitude: -75 });
    expect(result.isError).toBe(true);
    const error = result.structuredContent?.error as { code?: string } | undefined;
    expect(error?.code).toBe('INVALID_ARGUMENT');
  });

  it('surfaces QUOTES_UNAVAILABLE when quoting is not configured', async () => {
    const result = await callQuote(envWith({ OFFER_SIGNING_SECRET: undefined }), { location: 'K1A 0A6' });
    expect(result.isError).toBe(true);
    const error = result.structuredContent?.error as { code?: string } | undefined;
    expect(error?.code).toBe('QUOTES_UNAVAILABLE');
  });
});
