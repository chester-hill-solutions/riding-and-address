import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { handleLookupRequest } from './lookup-handler';
import { type LookupRidingFn } from './lookup-expansion';
import type { KeyAuthResult } from './api-keys';
import type { RouteContext } from './route-context';
import { DEFAULT_DEMO_RATE_LIMIT } from './utils';

const DATASETS = [
  'federal', 'combined', 'on', 'qc', 'bc', 'ab', 'ns', 'nb', 'mb', 'sk', 'nl', 'pe', 'nt', 'nu', 'yt',
] as const;

export interface CanCoderMcpOptions {
  request: Request;
  routeContext: RouteContext;
  lookupRiding: LookupRidingFn;
  auth: KeyAuthResult | null;
}

function responseText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** Build the same lookup capability for both modern and legacy MCP clients. */
export function createCanCoderMcpHandler(options: CanCoderMcpOptions) {
  return createMcpHandler(() => {
    const server = new McpServer(
      { name: 'CanCoder', version: '1.0.0' },
      {
        instructions:
          'Resolve Canadian addresses or coordinates to current federal, provincial, or combined electoral district data. ' +
          `The result includes the dataset vintage. Demo calls without a Server API key are limited to ${DEFAULT_DEMO_RATE_LIMIT} requests per minute per IP. ` +
          'Do not treat an address match as Canada Post-certified.',
      }
    );

    server.registerTool(
      'lookup_riding',
      {
        title: 'Look up an electoral riding',
        description:
          'Map a Canadian postal code, street address, or coordinate pair to an electoral riding. ' +
          'Use a province code as the dataset for a provincial or territorial riding, or choose federal/combined. ' +
          `Without Authorization: Bearer <Server API key>, this uses the unbilled demo tier, limited to ${DEFAULT_DEMO_RATE_LIMIT} requests per minute per IP.`,
        inputSchema: z.object({
          location: z.string().min(1).max(300).optional().describe(
            'Canadian postal code or street address. For a street address, provide city and province when known.'
          ),
          city: z.string().min(1).max(120).optional().describe('Municipality for a street address.'),
          province: z.string().min(2).max(80).optional().describe('Province or territory name or code.'),
          latitude: z.number().min(-90).max(90).optional().describe('Latitude in WGS84; provide together with longitude.'),
          longitude: z.number().min(-180).max(180).optional().describe('Longitude in WGS84; provide together with latitude.'),
          dataset: z.enum(DATASETS).optional().describe(
            'federal (default), combined, or a province/territory code: on, qc, bc, ab, ns, nb, mb, sk, nl, pe, nt, nu, yt.'
          ),
        }),
        outputSchema: z.object({
          summary: z.string(),
          result: z.record(z.string(), z.unknown()),
        }),
        annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      },
      async (args) => {
        const hasCoordinates = args.latitude !== undefined || args.longitude !== undefined;
        if (hasCoordinates && (args.latitude === undefined || args.longitude === undefined)) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Provide both latitude and longitude.' }],
          };
        }
        if (hasCoordinates === Boolean(args.location)) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Provide either location or both coordinates.' }],
          };
        }

        const dataset = args.dataset || 'federal';
        if (dataset === 'combined' && !args.province) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Provide province when requesting the combined federal and provincial result.' }],
          };
        }

        const path = `/api/${dataset}`;
        const query = new URLSearchParams();
        if (args.location) {
          if (/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(args.location.trim())) {
            query.set('postal', args.location.trim());
          } else {
            query.set('address', args.location.trim());
          }
        }
        if (args.city) query.set('city', args.city);
        if (args.province) query.set('state', args.province);
        if (dataset === 'combined') query.set('include_province', 'true');
        if (args.latitude !== undefined && args.longitude !== undefined) {
          query.set('lat', String(args.latitude));
          query.set('lon', String(args.longitude));
        }
        const lookupRequest = new Request(`${new URL(options.request.url).origin}${path}?${query}`, {
          method: 'GET',
          headers: options.request.headers,
        });
        const response = await handleLookupRequest({
          ...options.routeContext,
          request: lookupRequest,
          url: new URL(lookupRequest.url),
          billing: options.auth?.ok && options.auth.key && options.auth.customer
            ? { key: options.auth.key, customer: options.auth.customer }
            : null,
          deps: { lookup: options.lookupRiding },
        });
        const body = await response.json() as Record<string, unknown>;
        if (!response.ok) {
          return { isError: true, content: [{ type: 'text', text: responseText(body) }] };
        }

        const properties = body.properties && typeof body.properties === 'object'
          ? body.properties as Record<string, unknown>
          : null;
        const riding = typeof body.riding === 'string'
          ? body.riding
          : typeof properties?.FED_NAME === 'string'
            ? properties.FED_NAME
            : 'No riding match';
        const datasetMeta = body.dataset && typeof body.dataset === 'object'
          ? body.dataset as Record<string, unknown>
          : {};
        const summary = `${riding} (${String(datasetMeta.name || dataset)}; dataset year ${String(datasetMeta.year || 'unknown')}).`;
        const result = { summary, result: body };
        return {
          content: [{ type: 'text', text: responseText(result) }],
          structuredContent: result,
        };
      }
    );

    return server;
  }, { legacy: 'stateless' });
}

export function getAgentQuickstart(publicOrigin: string): string {
  return `# CanCoder for AI agents

CanCoder resolves Canadian postal codes, street addresses, and coordinates to federal,
provincial, and territorial electoral districts.

## Connect with MCP

Add this remote MCP server URL to your MCP client:

\`${publicOrigin}/mcp\`

The server exposes the read-only \`lookup_riding\` tool. A limited demo is available without a
key (${DEFAULT_DEMO_RATE_LIMIT} requests per minute per IP). For metered production calls, create a CanCoder Server API key and configure your MCP client
to send it as \`Authorization: Bearer <server-key>\`. Never paste a live key into a prompt or a
public conversation.

## Example requests

- “Which federal riding contains postal code K1A 0A6?”
- “Find the Ontario riding for 123 Main Street, Ottawa.”
- “Which riding contains latitude 45.4215, longitude -75.6972?”

For provincial or territorial results, choose the matching dataset code (for example \`on\` or
\`qc\`). Choose \`combined\` and provide a province to return federal and provincial results.

Responses include the riding properties and the boundary dataset year. A match is not certified
by Canada Post. If the result has no riding properties, treat it as unresolved and ask for a more
complete address or coordinates.
`;
}
