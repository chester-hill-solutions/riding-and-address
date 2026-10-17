import { describe, it, expect } from 'vitest';
import { createCanCoderMcpHandler } from '../src/mcp';
import { createRouteContext } from '../src/route-context';
import { AREA_MAX_RESULTS, AREA_UNIT_PRICE_USD } from '../src/offers';
import { createLookupTestEnv } from './helpers/lookup-test-env';
import type { Env } from '../src/types';

/**
 * The paid area product has to be reachable from MCP, not only from raw HTTP — otherwise the primary
 * agent interface cannot buy the flagship product. `quote_area` wraps the same `/api/quote` route the
 * REST surface uses, so the two cannot disagree about a valid request or about the price.
 */

const MOCK_CTX = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;

const RIDING = 'Spadina—Harbourfront';

/** A closed WGS84 ring inside Ontario, where the fixture has address coverage. */
const BOUNDARY = {
  type: 'Polygon',
  coordinates: [
    [
      [-79.5, 43.5],
      [-79.2, 43.5],
      [-79.2, 43.8],
      [-79.5, 43.8],
      [-79.5, 43.5],
    ],
  ],
};

function parseRpc(text: string): {
  result?: { isError?: boolean; structuredContent?: Record<string, unknown> };
} {
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  if (!line) throw new Error(`No SSE data line in: ${text.slice(0, 200)}`);
  return JSON.parse(line.slice('data: '.length));
}

async function callAreaQuote(env: Env, args: Record<string, unknown>) {
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
      params: { name: 'quote_area', arguments: args },
    }),
  });
  const response = await handler.fetch(rpc);
  return parseRpc(await response.text()).result ?? {};
}

const envWith = (overrides: Partial<Env> = {}): Env =>
  ({
    ...createLookupTestEnv(),
    PUBLIC_API_HOSTS: 'lookup.test',
    OFFER_SIGNING_SECRET: 'test-secret',
    ...overrides,
  }) as unknown as Env;

const errorCode = (result: { structuredContent?: Record<string, unknown> }): string | undefined =>
  (result.structuredContent?.error as { code?: string } | undefined)?.code;

describe('quote_area MCP tool', () => {
  it('returns a signed offer for a riding, priced in whole units', async () => {
    const result = await callAreaQuote(envWith(), { riding: RIDING, maximum_results: 300 });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.ok).toBe(true);
    const offer = result.structuredContent?.offer as {
      operation?: string;
      offerId?: string;
      price?: { maximum?: number };
      limits?: { maximumResults?: number };
      scope?: { datasetYear?: number };
    };
    expect(offer.operation).toBe('area.search');
    expect(offer.offerId).toBeTruthy();
    expect(offer.scope?.datasetYear).toBe(2024);
    expect(offer.limits?.maximumResults).toBe(300);
    // 300 records is two 250-record units.
    expect(offer.price?.maximum).toBe(AREA_UNIT_PRICE_USD * 2);
  });

  it('quotes a caller-supplied boundary when province is given', async () => {
    const result = await callAreaQuote(envWith(), {
      boundary: BOUNDARY,
      province: 'ON',
      maximum_results: 250,
    });

    expect(result.isError).toBeFalsy();
    const offer = result.structuredContent?.offer as {
      operation?: string;
      scope?: { geometryHash?: string; province?: string };
    };
    expect(offer.operation).toBe('area.search');
    // The scope carries the shape's hash, not the shape: pages resend it and check it against the hash.
    expect(offer.scope?.geometryHash).toBeTruthy();
    expect(offer.scope?.province).toBe('ON');
  });

  it('rejects both a riding and a boundary', async () => {
    const result = await callAreaQuote(envWith(), { riding: RIDING, boundary: BOUNDARY, province: 'ON' });
    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe('INVALID_ARGUMENT');
  });

  it('rejects neither a riding nor a boundary', async () => {
    const result = await callAreaQuote(envWith(), { maximum_results: 250 });
    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe('INVALID_ARGUMENT');
  });

  it('rejects a boundary with no province', async () => {
    const result = await callAreaQuote(envWith(), { boundary: BOUNDARY });
    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe('INVALID_ARGUMENT');
  });

  it('surfaces the route cap as LIMIT_EXCEEDED', async () => {
    const result = await callAreaQuote(envWith(), { riding: RIDING, maximum_results: AREA_MAX_RESULTS + 1 });
    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe('LIMIT_EXCEEDED');
  });

  it('surfaces an unknown riding as RIDING_NOT_FOUND', async () => {
    const result = await callAreaQuote(envWith(), { riding: 'Nowhere' });
    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe('RIDING_NOT_FOUND');
  });

  it('surfaces QUOTES_UNAVAILABLE when quoting is not configured', async () => {
    const result = await callAreaQuote(envWith({ OFFER_SIGNING_SECRET: undefined }), { riding: RIDING });
    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe('QUOTES_UNAVAILABLE');
  });
});
