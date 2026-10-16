import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { handleLookupRequest } from './lookup-handler';
import { handleQuoteRequest } from './offers';
import { type LookupRidingFn } from './lookup-expansion';
import type { KeyAuthResult } from './api-keys';
import type { RouteContext } from './route-context';
import { DEFAULT_DEMO_RATE_LIMIT } from './utils';

const DATASETS = [
  'federal', 'combined', 'on', 'qc', 'bc', 'ab', 'ns', 'nb', 'mb', 'sk', 'nl', 'pe', 'nt', 'nu', 'yt',
] as const;

/** The lookup inputs both the lookup and quote tools accept. */
const LOOKUP_TOOL_SCHEMA = z.object({
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
});

type LookupToolArgs = z.infer<typeof LOOKUP_TOOL_SCHEMA>;

/**
 * Validate the shared lookup inputs and build the query a lookup or quote route expects. Shared so
 * the two tools cannot disagree about what a valid request is.
 */
function lookupQueryFor(
  args: LookupToolArgs
): { query: URLSearchParams; dataset: string } | { error: string } {
  const hasCoordinates = args.latitude !== undefined || args.longitude !== undefined;
  if (hasCoordinates && (args.latitude === undefined || args.longitude === undefined)) {
    return { error: 'Provide both latitude and longitude.' };
  }
  if (hasCoordinates === Boolean(args.location)) {
    return { error: 'Provide either location or both coordinates.' };
  }

  const dataset = args.dataset || 'federal';
  if (dataset === 'combined' && !args.province) {
    return { error: 'Provide province when requesting the combined federal and provincial result.' };
  }

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
  return { query, dataset };
}

/** The quote tool's result: an offer, or the API's own error code. */
const QUOTE_OUTPUT_SCHEMA = z.object({
  ok: z.boolean(),
  offer: z.record(z.string(), z.unknown()).optional(),
  error: z
    .object({ code: z.string(), message: z.string(), correlationId: z.string().optional() })
    .optional(),
});

export interface CanCoderMcpOptions {
  request: Request;
  routeContext: RouteContext;
  lookupRiding: LookupRidingFn;
  auth: KeyAuthResult | null;
}

function responseText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * The tool's result envelope. `ok` is false when no riding resolved or the lookup failed, and
 * `error.code` carries a stable code so an agent can branch without parsing prose.
 *
 * Codes: `INVALID_ARGUMENT` for a bad tool call, `UNRESOLVED_LOCATION` for a valid query that
 * matched nothing, and otherwise the HTTP API's own error code passed straight through — the same
 * code the equivalent REST call returns, so the two surfaces stay one contract.
 */
const TOOL_OUTPUT_SCHEMA = z.object({
  ok: z.boolean(),
  summary: z.string(),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      correlationId: z.string().optional(),
    })
    .optional(),
});

type ToolOutput = z.infer<typeof TOOL_OUTPUT_SCHEMA>;

/** A failed tool call: `isError` true, plus a structured body an agent can act on. */
function toolError(code: string, message: string, correlationId?: string) {
  const output: ToolOutput = {
    ok: false,
    summary: message,
    error: { code, message, ...(correlationId ? { correlationId } : {}) },
  };
  return {
    isError: true,
    content: [{ type: 'text' as const, text: responseText(output) }],
    structuredContent: output,
  };
}

/** A failed quote call, in the quote tool's shape. */
function quoteToolError(code: string, message: string, correlationId?: string) {
  const output = {
    ok: false,
    error: { code, message, ...(correlationId ? { correlationId } : {}) },
  };
  return {
    isError: true,
    content: [{ type: 'text' as const, text: responseText(output) }],
    structuredContent: output,
  };
}

/** A completed tool call that resolved nothing: the tool worked, the data did not. */
function unresolvedLocation(summary: string, result: Record<string, unknown>) {
  const output: ToolOutput = {
    ok: false,
    summary,
    result,
    error: {
      code: 'UNRESOLVED_LOCATION',
      message:
        'No electoral district matched the input. Provide a more complete address, a postal code, or coordinates.',
    },
  };
  return {
    content: [{ type: 'text' as const, text: responseText(output) }],
    structuredContent: output,
  };
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
          `Without Authorization: Bearer <Server API key>, this uses the unbilled demo tier, limited to ${DEFAULT_DEMO_RATE_LIMIT} requests per minute per IP. ` +
          'The result carries `ok` and, when nothing resolved or the call failed, a structured `error.code` ' +
          '(INVALID_ARGUMENT, UNRESOLVED_LOCATION, DATASET_UNAVAILABLE, INVALID_QUERY, RATE_LIMIT_EXCEEDED, KEY_REQUIRED, LOOKUP_ERROR).',
        inputSchema: LOOKUP_TOOL_SCHEMA,
        outputSchema: TOOL_OUTPUT_SCHEMA,
        annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      },
      async (args) => {
        const built = lookupQueryFor(args);
        if ('error' in built) {
          return toolError('INVALID_ARGUMENT', built.error);
        }
        const { query, dataset } = built;
        const path = `/api/${dataset}`;
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
          // Pass the API's own code through, so the MCP and REST surfaces report the same code.
          return toolError(
            typeof body.code === 'string' ? body.code : 'LOOKUP_ERROR',
            typeof body.error === 'string' ? body.error : 'The lookup failed.',
            typeof body.correlationId === 'string' ? body.correlationId : undefined
          );
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

        if (!properties) {
          return unresolvedLocation(summary, body);
        }

        const output: ToolOutput = { ok: true, summary, result: body };
        return {
          content: [{ type: 'text', text: responseText(output) }],
          structuredContent: output,
        };
      }
    );

    server.registerTool(
      'quote_lookup',
      {
        title: 'Quote a lookup before paying',
        description:
          'Request a free, expiring offer for a lookup. The offer binds the request inputs, the boundary ' +
          'dataset vintage and a maximum price, and carries a signed offerId to accept. Requesting a quote ' +
          'consumes no billable usage and needs no key. Use lookup_riding for the free demo lookup itself.',
        inputSchema: LOOKUP_TOOL_SCHEMA,
        outputSchema: QUOTE_OUTPUT_SCHEMA,
        annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
      },
      async (args) => {
        const built = lookupQueryFor(args);
        if ('error' in built) {
          return quoteToolError('INVALID_ARGUMENT', built.error);
        }
        const { query, dataset } = built;
        query.set('dataset', dataset);
        const quoteRequest = new Request(
          `${new URL(options.request.url).origin}/api/quote?${query}`,
          { method: 'GET', headers: options.request.headers }
        );
        const response = await handleQuoteRequest({
          ...options.routeContext,
          request: quoteRequest,
          url: new URL(quoteRequest.url),
        });
        const body = (await response.json()) as Record<string, unknown>;
        if (!response.ok) {
          return quoteToolError(
            typeof body.code === 'string' ? body.code : 'QUOTE_ERROR',
            typeof body.error === 'string' ? body.error : 'The quote failed.',
            typeof body.correlationId === 'string' ? body.correlationId : undefined
          );
        }
        const output = { ok: true, offer: body };
        return {
          content: [{ type: 'text' as const, text: responseText(output) }],
          structuredContent: output,
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
by Canada Post. The tool returns a structured result with an \`ok\` flag. When \`ok\` is false, read
\`error.code\`: \`UNRESOLVED_LOCATION\` means no district matched, so ask for a more complete address
or coordinates; \`INVALID_ARGUMENT\` means fix the tool call; any other code is the API's own error
(for example \`DATASET_UNAVAILABLE\` or \`RATE_LIMIT_EXCEEDED\`).

## Machine-readable terms

Capabilities, price, free tier, data coverage, auth, and error codes are published as JSON at
\`${publicOrigin}/.well-known/cancoder.json\`, and the OpenAPI description is at
\`${publicOrigin}/api/docs\`.

## Quoting before paying

\`GET ${publicOrigin}/api/quote\` returns a free, expiring offer bound to your inputs, the boundary
dataset vintage and a maximum price. Requesting a quote consumes no billable usage and needs no key.
Pass \`dataset\` to quote a provincial or combined lookup (federal by default). The MCP server exposes
the same thing as the \`quote_lookup\` tool.
`;
}
