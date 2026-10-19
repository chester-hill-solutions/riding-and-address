import { createMcpHandler, McpServer, inputRequired } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  PURCHASE_INPUT_KEY,
  accountSummary,
  createPurchaseCodec,
  purchaseMessage,
  purchaseUrl,
  type PurchaseRequestState,
} from './mcp-purchase';
import { handleLookupRequest } from './lookup-handler';
import { AREA_MAX_RESULTS, AREA_UNIT_RECORDS, handleQuoteRequest } from './offers';
import { LOOKUP_SCOPE, scopeChallengeFor } from './mcp-scopes';
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
 * The area quote's inputs. An area search is bounded either by a riding — resolved in a boundary
 * dataset — or by a caller-supplied shape, never both. The price is a whole number of
 * 250-record units, so the ceiling is charged, not the page count.
 */
const AREA_TOOL_SCHEMA = z.object({
  riding: z.string().min(1).max(200).optional().describe(
    'A riding id or name, resolved in the chosen boundary dataset. Provide this or boundary, not both.'
  ),
  boundary: z.record(z.string(), z.unknown()).optional().describe(
    'A WGS84 GeoJSON Polygon or MultiPolygon. Provide this or riding, not both. Requires province.'
  ),
  province: z.string().min(2).max(80).optional().describe(
    'Two-letter province. Required with boundary: polygon queries are province-scoped.'
  ),
  dataset: z.enum(DATASETS).optional().describe(
    'The boundary dataset to resolve a riding in: federal (default) or a province/territory code.'
  ),
  maximum_results: z.number().int().positive().optional().describe(
    `The most records to buy, up to ${AREA_MAX_RESULTS}. Priced in ${AREA_UNIT_RECORDS}-record units.`
  ),
});

type AreaToolArgs = z.infer<typeof AREA_TOOL_SCHEMA>;

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

/**
 * Build the `/api/quote` request an area quote needs. A riding travels in the query string; a shape
 * cannot, so it goes in a POST body together with the province it is scoped to. The route validates
 * the shape, the dataset and the result cap, so this only decides which form to send.
 */
function areaQuoteRequestFor(
  args: AreaToolArgs,
  origin: string
): { request: Request } | { error: string } {
  const riding = args.riding?.trim();
  const hasRiding = Boolean(riding);
  const hasBoundary = args.boundary !== undefined && args.boundary !== null;
  if (hasRiding === hasBoundary) {
    return { error: 'Provide either riding or boundary, not both.' };
  }
  if (hasBoundary && !args.province) {
    return { error: 'Provide province with a boundary; polygon queries are province-scoped.' };
  }

  if (hasBoundary) {
    return {
      request: new Request(`${origin}/api/quote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operation: 'area.search',
          province: args.province,
          ...(args.maximum_results !== undefined ? { maximum_results: args.maximum_results } : {}),
          boundary: args.boundary,
        }),
      }),
    };
  }

  const query = new URLSearchParams();
  query.set('operation', 'area.search');
  query.set('dataset', args.dataset || 'federal');
  query.set('riding', riding as string);
  if (args.maximum_results !== undefined) query.set('maximum_results', String(args.maximum_results));
  return { request: new Request(`${origin}/api/quote?${query}`, { method: 'GET' }) };
}

/** The quote tool's result: an offer, or the API's own error code. */const QUOTE_OUTPUT_SCHEMA = z.object({
  ok: z.boolean(),
  offer: z.record(z.string(), z.unknown()).optional(),
  error: z
    .object({ code: z.string(), message: z.string(), correlationId: z.string().optional() })
    .optional(),
});

/** The purchase tool's result: the account state, read from the server, never from the client. */
const PURCHASE_OUTPUT_SCHEMA = z.object({
  ok: z.boolean(),
  summary: z.string(),
  account: z.object({ authenticated: z.boolean() }).optional(),
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
function quoteToolError(code: string, message: string, correlationId?: string) {  const output = {
    ok: false,
    error: { code, message, ...(correlationId ? { correlationId } : {}) },
  };
  return {
    isError: true,
    content: [{ type: 'text' as const, text: responseText(output) }],
    structuredContent: output,
  };
}

/** A failed purchase call, in the purchase tool's shape. */
function purchaseToolError(code: string, message: string, correlationId?: string) {
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
    // The purchase hand-off's `requestState` codec, or null when the deployment cannot sign one. A
    // misconfigured secret must not be able to take down the free lookup tools.
    const purchaseCodec = createPurchaseCodec(options.routeContext.env.OFFER_SIGNING_SECRET);

    const server = new McpServer(
      { name: 'CanCoder', version: '1.0.0' },
      {
        instructions:
          'Resolve Canadian addresses or coordinates to current federal, provincial, or combined electoral district data. ' +
          `The result includes the dataset vintage. Demo calls without a Server API key are limited to ${DEFAULT_DEMO_RATE_LIMIT} requests per minute per IP. ` +
          'Do not treat an address match as Canada Post-certified. ' +
          'Paid work is quoted first with quote_lookup or quote_area; use purchase when a person needs to set up payment.',
        // `requestState` round-trips through the client and is attacker-controlled on re-entry, so
        // the seam verifies it before the handler runs (spec revision 2026-07-28).
        ...(purchaseCodec ? { requestState: { verify: purchaseCodec.verify } } : {}),
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
          '(INVALID_ARGUMENT, UNRESOLVED_LOCATION, DATASET_UNAVAILABLE, INVALID_QUERY, RATE_LIMIT_EXCEEDED, KEY_REQUIRED, LOOKUP_TIMEOUT, LOOKUP_ERROR). ' +
          'A LOOKUP_TIMEOUT is transient — the lookup did not finish inside its budget, which is ' +
          'most likely on a cold start; retry it.',
        inputSchema: LOOKUP_TOOL_SCHEMA,
        outputSchema: TOOL_OUTPUT_SCHEMA,
        annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
        // The scope an OAuth token must carry to run this tool. The server refuses a call the
        // token's scopes do not cover, before the tool runs, so an under-scoped token never
        // executes or bills a lookup. A request with no credential — the keyless demo tier — is
        // not challenged at all, because it is how an agent discovers this service.
        scopeChallenge: scopeChallengeFor(LOOKUP_SCOPE),
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
          // The Customer is what the ledger keys on, so a Customer alone is enough to bill. An
          // OAuth access token resolves to a Customer and carries no key record, and the
          // condition used to require one — so an authenticated token's lookups skipped the
          // monthly ledger, the monthly hard fuse and the Stripe meter entirely, and no rate
          // limit noticed, because those are minute-window counters and not the monthly one.
          billing: options.auth?.ok && options.auth.customer
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

    server.registerTool(
      'quote_area',
      {
        title: 'Quote an area search before paying',
        description:
          'Request a free, expiring offer for an address search within a riding or a caller-supplied ' +
          `shape. Priced in ${AREA_UNIT_RECORDS}-record units, up to ${AREA_MAX_RESULTS} records per offer; ` +
          'the accepted ceiling is charged, not the number of pages read. Requesting a quote consumes no ' +
          'billable usage and needs no key. The offer carries a signed offerId to accept over HTTP ' +
          '(`POST /api/quote/accept`); payment is account-free, and one acceptance covers every page.',
        inputSchema: AREA_TOOL_SCHEMA,
        outputSchema: QUOTE_OUTPUT_SCHEMA,
        annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
      },
      async (args) => {
        const built = areaQuoteRequestFor(args, new URL(options.request.url).origin);
        if ('error' in built) {
          return quoteToolError('INVALID_ARGUMENT', built.error);
        }
        const { request: quoteRequest } = built;
        const response = await handleQuoteRequest({
          ...options.routeContext,
          request: quoteRequest,
          url: new URL(quoteRequest.url),
        });
        const body = (await response.json()) as Record<string, unknown>;
        if (!response.ok) {
          // The route owns validation, so its codes reach the agent unchanged: LIMIT_EXCEEDED,
          // RIDING_NOT_FOUND, NO_ADDRESS_COVERAGE, INVALID_SHAPE, DATASET_UNAVAILABLE, …
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

    server.registerTool(
      'purchase',
      {
        title: 'Set up payment with a person',
        description:
          'Hand a payment-setup step to the person using this client, then report their account state. ' +
          'Call it when paid work is blocked and no payment method is available: the client opens a ' +
          'CanCoder page where the human creates an account or adds a payment method, and the call is ' +
          'retried afterwards. It charges nothing itself, and an agent that can pay with x402 does not ' +
          'need it. The response reports what the account actually is, not what the client said happened.',
        inputSchema: z.object({}),
        outputSchema: PURCHASE_OUTPUT_SCHEMA,
        annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
      },
      async (_args, ctx) => {
        const account = accountSummary(options.auth);

        if (!purchaseCodec) {
          return purchaseToolError(
            'PURCHASE_UNAVAILABLE',
            'Payment setup is not available on this deployment.'
          );
        }

        // Re-entry: the client has been round the elicitation. The seam has already verified the
        // `requestState` (an unverifiable one never reaches here), but the response itself only says a
        // page was shown — so what we report is read from the account, never from the response.
        const echoed = ctx.mcpReq.inputResponses;
        if (echoed && PURCHASE_INPUT_KEY in echoed) {
          const output = {
            ok: true,
            summary: account.summary,
            account: { authenticated: account.authenticated },
          };
          return {
            content: [{ type: 'text' as const, text: responseText(output) }],
            structuredContent: output,
          };
        }

        const origin = new URL(options.request.url).origin;
        return inputRequired({
          inputRequests: {
            [PURCHASE_INPUT_KEY]: inputRequired.elicitUrl({
              message: purchaseMessage(account.authenticated),
              url: purchaseUrl(origin, account.authenticated),
            }),
          },
          requestState: await purchaseCodec.mint(
            { correlationId: options.routeContext.correlationId } satisfies PurchaseRequestState,
            ctx
          ),
        });
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

The server exposes three tools. \`lookup_riding\` maps a location to a riding — read-only, and free
without a key on the demo tier (${DEFAULT_DEMO_RATE_LIMIT} requests per minute per IP). \`quote_lookup\`
and \`quote_area\` return free, expiring offers for a paid lookup or an area search, without consuming
usage.

For metered production calls there are two routes. Create a CanCoder Server API key and send it as
\`Authorization: Bearer <server-key>\` — never paste a live key into a prompt or a public
conversation. Or use the OAuth flow: this server is an OAuth 2.1 authorization server, so a client
can get a **scoped** access token instead of a key, with a person approving it once at
\`${publicOrigin}/consent\`. Start at \`${publicOrigin}/auth.md\` — it has the endpoints, how a
client identifies itself, and the scopes.

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

## Discover first

Everything an agent needs is published, so nothing has to be scraped:

- \`${publicOrigin}/.well-known/cancoder.json\` — capabilities, price, free tier, coverage, auth, errors
- \`${publicOrigin}/llms.txt\` — a short index of the resources below
- \`${publicOrigin}/.well-known/ai-catalog.json\` — ARD manifest: this API and the MCP server
- \`${publicOrigin}/.well-known/mcp/server-card.json\` — the MCP server's tools
- \`${publicOrigin}/auth.md\` — how credentials work, and how to get one
- \`${publicOrigin}/api/docs\` — the OpenAPI description

## End-to-end: a free lookup

\`\`\`bash
curl "${publicOrigin}/api/federal?postal=K1A0A6"
\`\`\`

No key, rate limited per IP, not billable. Over MCP, call \`lookup_riding\`.

## End-to-end: quote, pay, retrieve

A priced call is quoted first, and payment is account-free — no signup, no key.

1. **Quote.** Free, expiring, and bound to your inputs and a maximum price.

\`\`\`bash
curl "${publicOrigin}/api/quote?postal=K1A0A6"
\`\`\`

2. **Accept.** Unpaid, this answers \`402\` with the requirements in the \`PAYMENT-REQUIRED\` header.
   Retry with a signed payment payload:

\`\`\`bash
curl -X POST "${publicOrigin}/api/quote/accept?offer=<offerId>" \\
  -H "PAYMENT-SIGNATURE: <base64 payment payload>"
\`\`\`

3. **Retrieve.** A settled call returns the quoted result and a receipt, with the settlement echoed
   in \`PAYMENT-RESPONSE\`. A retry never charges twice.

## End-to-end: an area search

Over MCP, call \`quote_area\` to get the same offer. Over HTTP:

1. **Quote a riding** — priced in 250-record units, up to 1,000 records per offer:

\`\`\`bash
curl "${publicOrigin}/api/quote?operation=area.search&dataset=on&riding=Ottawa%20Centre&maximum_results=500"
\`\`\`

   For a caller-supplied shape, POST the boundary (a WGS84 Polygon or MultiPolygon). Polygon queries
   are province-scoped:

\`\`\`bash
curl -X POST "${publicOrigin}/api/quote" -H "content-type: application/json" \\
  -d '{"operation":"area.search","province":"ON","maximum_results":500,"boundary":{"type":"Polygon","coordinates":[[[-79.4,43.6],[-79.3,43.6],[-79.3,43.7],[-79.4,43.7],[-79.4,43.6]]]}}'
\`\`\`

2. **Accept** it as above, resending the boundary when you quoted a shape. Page one comes back with
   a \`page.cursor\`.

3. **Page** until \`page.hasMore\` is false. One accepted offer covers every page — pages are
   delivery, not charges.

\`\`\`bash
curl "${publicOrigin}/api/area?cursor=<cursor>"                              # riding-bounded
curl -X POST "${publicOrigin}/api/area" -H "content-type: application/json" \\
  -d '{"cursor":"<cursor>","boundary":{...}}'                                # caller-supplied shape
\`\`\`

If a response is marked \`page.truncated\`, the result reached the ceiling you paid for: request a
larger offer rather than expecting more pages.
`;
}
