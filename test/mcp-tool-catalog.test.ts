import { describe, it, expect } from 'vitest';
import { createCanCoderMcpHandler } from '../src/mcp';
import { createMcpServerCard } from '../src/agent-discovery';
import { createRouteContext } from '../src/route-context';
import { createLookupTestEnv } from './helpers/lookup-test-env';
import type { Env } from '../src/types';

/**
 * The MCP Server Card is hand-maintained and read literally by agents. It is the one place a tool
 * could be advertised that the server does not actually expose, or a new tool could go missing from
 * discovery. This compares the card against the server's own `tools/list` so the two cannot drift.
 */

const MOCK_CTX = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;

const ORIGIN = 'https://lookup.test';

async function listToolNames(env: Env): Promise<string[]> {
  const request = new Request(`${ORIGIN}/mcp`, {
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
  const rpc = new Request(`${ORIGIN}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  const response = await handler.fetch(rpc);
  const line = (await response.text()).split('\n').find((l) => l.startsWith('data: '));
  if (!line) throw new Error('No SSE data line in tools/list response');
  const parsed = JSON.parse(line.slice('data: '.length)) as {
    result?: { tools?: Array<{ name: string }> };
  };
  return (parsed.result?.tools ?? []).map((tool) => tool.name);
}

describe('MCP tool catalogue', () => {
  it('advertises exactly the tools the server exposes', async () => {
    const env = {
      ...createLookupTestEnv(),
      PUBLIC_API_HOSTS: 'lookup.test',
      OFFER_SIGNING_SECRET: 'test-secret',
    } as unknown as Env;

    const card = createMcpServerCard(ORIGIN) as {
      capabilities: { tools: Array<{ name: string }> };
    };
    const advertised = card.capabilities.tools.map((tool) => tool.name).sort();

    expect((await listToolNames(env)).sort()).toEqual(advertised);
  });
});
