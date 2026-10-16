import { describe, it, expect } from 'vitest';
import { createCanCoderMcpHandler } from '../src/mcp';
import { createRouteContext } from '../src/route-context';
import { createLookupTestEnv } from './helpers/lookup-test-env';
import type { LookupResult } from '../src/types';

/**
 * The `lookup_riding` tool must fail in a way an agent can act on: a stable `error.code`, not prose.
 * These drive the real MCP handler with an injected lookup so each outcome is deterministic.
 */

const MOCK_CTX = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;

/** The stateless MCP handler answers with SSE; pull the JSON-RPC payload out of it. */
function parseRpc(text: string): {
  result?: { isError?: boolean; structuredContent?: Record<string, unknown> };
  error?: unknown;
} {
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  if (!line) throw new Error(`No SSE data line in: ${text.slice(0, 200)}`);
  return JSON.parse(line.slice('data: '.length));
}

async function callTool(
  lookupResult: LookupResult,
  args: Record<string, unknown>
): Promise<{ isError?: boolean; structuredContent?: Record<string, unknown> }> {
  const env = createLookupTestEnv();
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
    lookupRiding: async () => lookupResult,
    auth: null,
  });

  const rpc = new Request('https://lookup.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'lookup_riding', arguments: args },
    }),
  });

  const response = await handler.fetch(rpc);
  return parseRpc(await response.text()).result ?? {};
}

const HIT: LookupResult = {
  properties: { FED_NUM: 35079, ED_NAMEE: 'Ottawa Centre' },
  riding: 'Ottawa Centre',
};

describe('lookup_riding structured results', () => {
  it('reports a resolved riding as ok: true with the result', async () => {
    const result = await callTool(HIT, { latitude: 45.42, longitude: -75.69 });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.ok).toBe(true);
    expect(String(result.structuredContent?.summary)).toContain('Ottawa Centre');
    expect(result.structuredContent?.error).toBeUndefined();
  });

  it('codes a valid query that matched nothing as UNRESOLVED_LOCATION', async () => {
    const result = await callTool({ properties: null }, { latitude: 45.42, longitude: -75.69 });

    // The tool worked; the data did not resolve. That is not a tool failure.
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.ok).toBe(false);
    const error = result.structuredContent?.error as { code?: string } | undefined;
    expect(error?.code).toBe('UNRESOLVED_LOCATION');
  });

  it('codes a bad tool call as INVALID_ARGUMENT', async () => {
    const result = await callTool(HIT, {
      location: 'K1A 0A6',
      latitude: 45.42,
      longitude: -75.69,
    });

    expect(result.isError).toBe(true);
    const error = result.structuredContent?.error as { code?: string } | undefined;
    expect(error?.code).toBe('INVALID_ARGUMENT');
  });

  it('passes the HTTP API error code through unchanged', async () => {
    // A blank location reaches the lookup handler and fails query validation, so the tool must
    // surface the API's own INVALID_QUERY rather than inventing a second vocabulary.
    const result = await callTool(HIT, { location: ' ' });

    expect(result.isError).toBe(true);
    const error = result.structuredContent?.error as { code?: string } | undefined;
    expect(error?.code).toBe('INVALID_QUERY');
  });
});
