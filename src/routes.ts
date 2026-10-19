/**
 * The route table — one ordered inventory of every path this Worker and the portal serve.
 *
 * Three readers share it, so route ownership can no longer drift between them:
 *   1. the API dispatcher (`dispatch`) resolves API entries by computed specificity,
 *   2. the portal's forwarding decision reads `ownerOf(pathname)`,
 *   3. the docs coverage test asserts the OpenAPI spec equals the public API entries.
 *
 * The table was declared in full on day 1 (strangler migration), with the entries not yet ported
 * carrying `handler: legacy` and the Worker answering them from its old `fetch` guard-chain.
 *
 * **That migration is finished: every entry carries a real handler, and the guard-chain is gone.**
 * An entry marked `legacy` now means a mistake — the dispatcher answers it with a 404 rather than
 * falling through to a second dispatch path, because one dispatch path is the whole point.
 *
 * Specificity is computed, not positional: static beats `:param` beats `*`, longer wins,
 * declaration order breaks remaining ties.
 *
 * Handler implementations live beside their concerns (`ops-handlers.ts`, `docs.ts`, `embed.ts`,
 * `lookup-handler.ts`, `oda-handlers.ts`, …) and import `RouteContext` from the leaf
 * `route-context.ts`, never from here — which is what keeps this module free of the old cycle.
 */

import { handleApiReference, handleOpenApiDocs } from './docs';
import { handleEmbedDocs } from './embed-docs';
import { handleEmbedScript } from './embed-handlers';
import {
  handleCacheWarming,
  handleCircuitBreakerReset,
  handleHealth,
  handleMetrics,
} from './ops-handlers';
import { handleWebhookAdmin } from './webhook-admin';
import { getAllProvincialPaths } from './datasets';
import { handleDemoRoute, handleLookupRequest } from './lookup-handler';
import { handleDiscoveryRoute } from './agent-discovery';
import { handleMcpRoute } from './mcp-handler';
import { handleQuoteRequest, handleAcceptRequest, handleAreaRequest } from './offers';
import {
  handleBatchRoute,
  handleBatchStatusRoute,
  handleQueueSubmitRoute,
  handleQueueStatusRoute,
  handleQueueProcessRoute,
  handleQueueStatsRoute,
} from './batch';
import {
  handleDatabaseRoute,
  handleBoundariesRoute,
  handleGeocodingBatchStatus,
  handleCacheWarm,
} from './spatial-handlers';
import { handleReceiptsRequest } from './x402-receipts';
import { handleReconcileRequest } from './x402-reconcile';
import { handleOdaInit, handleOdaStats, handleGeocodeRoute, handleReverseRoute, handleNormalizeAddressRoute, handleSuggestRoute } from './oda-handlers';
import { handleProtectedResourceMetadata, protectedResourceMetadataPaths } from './oauth-metadata';
import { handleProjectionRequest, checkProjectionAuth, projectionUnauthorizedResponse } from './projection-handlers';
import type { RouteContext } from './route-context';
import {
  badRequest,
  checkAdminAuth,
  DEFAULT_DEMO_RATE_LIMIT,
  DEFAULT_PAID_RATE_LIMIT,
  DEFAULT_RATE_LIMIT,
  hasValidBasicAuth,
  rateLimitExceededResponse,
  unauthorizedResponse,
} from './utils';
import {
  apiKeysEnabled,
  authorizeLookupRequest,
  authorizeSearchRequest,
  extractApiKey,
  extractBearerToken,
  httpStatusForKeyDenial,
  type KeyAuthResult,
} from './api-keys';
import {
  consumeRateWindows,
  customerRateBucket,
  customerRateLimit,
  rateLimitIdentity,
  rateLimitKey,
  type RateWindow,
} from './rate-limit';
import type { BillableAuthContext } from './billing';
import { withoutCors } from './http-headers';
import { isOdaSuggestEnabled } from './oda-config';

export type RouteOwner = 'api' | 'portal';
export type RouteVisibility = 'public' | 'internal';
/**
 * The real auth dialects this Worker serves. Every entry names the gate `runPrelude` actually runs
 * for it, so the table is the authority for "what does this route require":
 *
 *  - `public`          no credential; the handler serves anyone.
 *  - `admin`           operator `BASIC_AUTH` (fail-closed when unset); denial is 401.
 *  - `admin-optional`  not a gate: serves everyone, extra detail to a valid operator credential.
 *  - `key`             lookup auth: a Customer Server key (`Bearer sk_…`) or operator BASIC_AUTH,
 *                      falling back to open/basic-only while `API_KEYS` is unbound. Delegates to
 *                      `authorizeLookupRequest` and resolves the Billable Customer onto `billing`.
 *  - `search`          autocomplete auth: operator/server credential OR an origin-bound Browser
 *                      key. Delegates to `authorizeSearchRequest` — deliberately not `key`, which
 *                      would reject Browser keys.
 *  - `batch`           Enterprise batch: when `API_KEYS` is bound, operator BASIC_AUTH OR a Server
 *                      key whose Customer has `batchEnabled`; otherwise an admin credential.
 *  - `projection`      the portal→Worker ops Bearer secret (`PROJECTION_ADMIN_SECRET`).
 */
export type RouteAuth =
  | 'public'
  | 'admin'
  | 'admin-optional'
  | 'key'
  | 'search'
  | 'batch'
  | 'projection';
/** Declarative rate-limit bucket; `runPrelude` enforces it once per request. */
export type RateLimitBucket =
  | 'none'
  | 'lookup'
  | 'geocode'
  | 'demo'
  | 'paid'
  | 'search'
  | 'batch';

export type RouteHandler = (ctx: RouteContext) => Promise<Response> | Response;

/**
 * Sentinel marking an entry that has no handler.
 *
 * **No entry carries it any more.** The strangler migration is finished: every route has a real
 * handler and the Worker's legacy guard-chain is deleted.
 *
 * It is kept because a table entry without a handler is a mistake someone can still make, and
 * this is what the mistake looks like — the dispatcher answers it with a 404 rather than
 * reaching for a fallback that no longer exists.
 */
export const legacy = Symbol('legacy');
export type RouteHandlerOrLegacy = RouteHandler | typeof legacy;

export type RouteEntry = {
  path: string | string[];
  methods: readonly string[];
  owner: RouteOwner;
  visibility: RouteVisibility;
  auth: RouteAuth;
  rateLimit: RateLimitBucket;
  /** Only API entries carry a handler. */
  handler?: RouteHandlerOrLegacy;
};

/** Routes above never inspect the method themselves, so they accept every one. */
export const ALL_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

const DEMO_PATHS = [
  '/api/demo/federal',
  '/api/demo/combined',
  '/api/demo/geocode',
  '/api/demo/reverse',
  '/api/demo/normalize-address',
];

/** The lookup surface served by one handler; `/api` and `/api/combined` are aliases of federal. */
const LOOKUP_PATHS = ['/api', '/api/federal', '/api/combined', ...getAllProvincialPaths()];

// ── The table ────────────────────────────────────────────────────────────────

export const ROUTES: readonly RouteEntry[] = [
  // Agent discovery resources are public and served by the API Worker on both public hosts.
  { path: ['/robots.txt', '/sitemap.xml', '/llms.txt', '/llms-full.txt', '/auth.md', '/.well-known/api-catalog', '/.well-known/ai-catalog.json', '/.well-known/ucp', '/.well-known/cancoder.json', '/.well-known/mcp/server-card.json', '/.well-known/agent-skills/index.json', '/.well-known/agent-skills/cancoder-riding-lookup/SKILL.md', '/docs/agents.md'], methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleDiscoveryRoute },
  { path: '/mcp', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleMcpRoute },
  // RFC 9728 protected-resource metadata. Served from the resource server, which is what RFC 9728
  // asks for and what the MCP plugin's own challenge points at — the plugin advertises this URL but
  // does not serve it. `internal` matches the other discovery documents in this table.
  { path: protectedResourceMetadataPaths(), methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleProtectedResourceMetadata },
  // Portal-owned (the portal entry decides with `ownerOf`).
  { path: '/', methods: ALL_METHODS, owner: 'portal', visibility: 'internal', auth: 'public', rateLimit: 'none' },
  { path: ['/login', '/signup'], methods: ALL_METHODS, owner: 'portal', visibility: 'internal', auth: 'public', rateLimit: 'none' },
  { path: ['/app', '/app/*'], methods: ALL_METHODS, owner: 'portal', visibility: 'internal', auth: 'public', rateLimit: 'none' },
  { path: '/api/auth/*', methods: ALL_METHODS, owner: 'portal', visibility: 'internal', auth: 'public', rateLimit: 'none' },
  { path: ['/api/stripe', '/api/stripe/*'], methods: ALL_METHODS, owner: 'portal', visibility: 'internal', auth: 'public', rateLimit: 'none' },

  // API gateway surface — ported.
  { path: '/api/docs', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleOpenApiDocs },
  { path: ['/docs', '/api/docs/ui', '/api/swagger', '/swagger'], methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleApiReference },
  { path: ['/docs/embed', '/embed/docs'], methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleEmbedDocs },
  { path: '/health', methods: ALL_METHODS, owner: 'api', visibility: 'public', auth: 'admin-optional', rateLimit: 'none', handler: handleHealth },
  { path: '/metrics', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleMetrics },
  { path: '/cache-warming', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleCacheWarming },
  { path: '/admin/circuit-breaker/reset', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleCircuitBreakerReset },
  { path: ['/webhooks', '/api/webhooks'], methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleWebhookAdmin },
  { path: ['/webhooks/*', '/api/webhooks/*'], methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleWebhookAdmin },

  // Lookup surface — ported; auth + rate limit run once in the prelude.
  { path: LOOKUP_PATHS, methods: ALL_METHODS, owner: 'api', visibility: 'public', auth: 'key', rateLimit: 'lookup', handler: handleLookupRequest },
  { path: '/embed.js', methods: ['GET'], owner: 'api', visibility: 'public', auth: 'public', rateLimit: 'none', handler: handleEmbedScript },
  { path: DEMO_PATHS, methods: ['GET'], owner: 'api', visibility: 'public', auth: 'public', rateLimit: 'demo', handler: handleDemoRoute },
  { path: '/api/demo/*', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'demo', handler: handleDemoRoute },
  // Offers: a free, expiring quote an agent accepts before paying. Keyless and rate-limited like
  // the demo tier, and never billable — requesting a quote does not touch the usage ledger.
  { path: '/api/quote', methods: ['GET', 'POST'], owner: 'api', visibility: 'public', auth: 'public', rateLimit: 'paid', handler: handleQuoteRequest },
  // Accept an offer through x402: 402 with requirements, then verify → settle → deliver.
  { path: '/api/quote/accept', methods: ['POST'], owner: 'api', visibility: 'public', auth: 'public', rateLimit: 'paid', handler: handleAcceptRequest },
  // Area pages after the first. Offer-only: the signed cursor is the authorization, so there is no
  // keyed route that could read addresses without paying.
  { path: '/api/area', methods: ['GET', 'POST'], owner: 'api', visibility: 'public', auth: 'public', rateLimit: 'paid', handler: handleAreaRequest },
  // Operator reconciliation view for the x402 rail. Internal + admin-gated: never public.
  { path: '/api/x402/receipts', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleReceiptsRequest },
  // Run x402 reconciliation on demand: confirm stored settlements against the chain.
  { path: '/api/x402/reconcile', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleReconcileRequest },

  // ODA geocoding surface — ported. The three geocode routes are intentionally NOT billed:
  // only 200 lookup/search responses are Billable units today. The billing-invariants gate
  // enforces that, and it now looks for these handlers where they live.
  { path: '/api/geocode', methods: ['GET'], owner: 'api', visibility: 'public', auth: 'key', rateLimit: 'geocode', handler: handleGeocodeRoute },
  { path: '/api/reverse', methods: ['GET'], owner: 'api', visibility: 'public', auth: 'key', rateLimit: 'geocode', handler: handleReverseRoute },
  { path: '/api/normalize-address', methods: ['GET'], owner: 'api', visibility: 'public', auth: 'key', rateLimit: 'geocode', handler: handleNormalizeAddressRoute },
  // Address autocomplete. A disabled suggest index means the route is not there, which is a 404 —
  // see handleSuggestRoute. Search 200s *are* billable, unlike the geocode routes above.
  { path: '/api/search', methods: ['GET'], owner: 'api', visibility: 'public', auth: 'search', rateLimit: 'search', handler: handleSuggestRoute },
  { path: '/api/oda/init', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleOdaInit },
  { path: '/api/oda/stats', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleOdaStats },

  // Batch / queue — ported.
  { path: '/batch', methods: ['POST'], owner: 'api', visibility: 'public', auth: 'batch', rateLimit: 'batch', handler: handleBatchRoute },
  { path: '/batch/:id', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'batch', rateLimit: 'batch', handler: handleBatchStatusRoute },
  { path: '/batch/*', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'batch', rateLimit: 'batch', handler: handleBatchStatusRoute },
  { path: '/api/queue/submit', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleQueueSubmitRoute },
  { path: '/api/queue/status', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleQueueStatusRoute },
  { path: '/api/queue/process', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleQueueProcessRoute },
  { path: '/api/queue/stats', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleQueueStatsRoute },
  // Anything else under /api/queue falls through to the /api lookup catch-all, so its real gate is
  // the lookup key, not admin.
  { path: '/api/queue/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'key', rateLimit: 'lookup', handler: handleLookupRequest },
  { path: '/queue/process', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleQueueProcessRoute },
  // Unclaimed: the legacy chain answers 404 with no credential, so the catch-all is public.
  { path: '/queue/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleLookupRequest },

  // Operator surfaces — the spatial database and boundary reads. Ported.
  { path: '/api/database/init', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleDatabaseRoute },
  { path: '/api/database/sync', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleDatabaseRoute },
  { path: '/api/database/stats', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleDatabaseRoute },
  { path: '/api/database/query', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleDatabaseRoute },
  // Unknown database sub-paths are a 404 with no credential — not the admin gate the old table
  // implied. The specific admin entries above carry their own declaration.
  { path: '/api/database/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleDatabaseRoute },
  { path: '/api/boundaries/lookup', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleBoundariesRoute },
  { path: '/api/boundaries/all', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleBoundariesRoute },
  { path: '/api/boundaries/config', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleBoundariesRoute },
  { path: '/api/boundaries/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleBoundariesRoute },
  { path: '/api/geocoding/batch/status', methods: ['GET'], owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleGeocodingBatchStatus },
  { path: '/api/cache/warm', methods: ['POST'], owner: 'api', visibility: 'internal', auth: 'admin', rateLimit: 'none', handler: handleCacheWarm },
  // `/api/oda/*` is not a surface: only the two admin entries above exist, and any other
  // `/api/oda/…` path is served by the `/api/*` lookup catch-all (key auth), not admin.
  { path: '/admin/projection/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'projection', rateLimit: 'none', handler: handleProjectionRequest },
  // Unclaimed /admin paths answer 404 with no credential; the projection and circuit-breaker
  // entries above are the real surfaces.
  { path: '/admin/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleNotFound },

  // Ownership catches that preserve today's prefix decisions.
  { path: '/docs/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'public', rateLimit: 'none', handler: handleNotFound },
  { path: '/api/*', methods: ALL_METHODS, owner: 'api', visibility: 'internal', auth: 'key', rateLimit: 'lookup', handler: handleLookupRequest },
];

// ── Pattern grammar + specificity ───────────────────────────────────────────

const PARAM_SEGMENT = /^:([A-Za-z_][A-Za-z0-9_]*)$/;

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type CompiledPattern = {
  entry: RouteEntry;
  regex: RegExp;
  paramNames: string[];
  weights: number[];
  order: number;
};

/**
 * Compiles `:param` and a trailing `*` into one anchored matcher. `:param` captures exactly one
 * segment; `*` captures the remainder (which may be empty) and is only legal as the last segment.
 */
export function compilePattern(pattern: string): {
  regex: RegExp;
  paramNames: string[];
  weights: number[];
} {
  if (!pattern.startsWith('/')) {
    throw new Error(`Route pattern must start with "/": ${pattern}`);
  }

  const segments = pattern.split('/').slice(1);
  const parts: string[] = [];
  const paramNames: string[] = [];
  const weights: number[] = [];

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;

    if (segment === '*') {
      if (!isLast) {
        throw new Error(`Wildcard "*" is only allowed as the final segment: ${pattern}`);
      }
      parts.push('(.*)');
      weights.push(0);
      return;
    }
    if (segment.includes('*')) {
      throw new Error(`Wildcard "*" must occupy a whole segment: ${pattern}`);
    }

    const param = PARAM_SEGMENT.exec(segment);
    if (param) {
      paramNames.push(param[1]);
      parts.push('([^/]+)');
      weights.push(1);
      return;
    }
    if (segment.includes(':')) {
      throw new Error(`Parameter must occupy a whole segment: ${pattern}`);
    }

    parts.push(escapeRegex(segment));
    weights.push(2);
  });

  return { regex: new RegExp(`^/${parts.join('/')}$`), paramNames, weights };
}

/**
 * Specificity comparator: compare segment weights (static=2, :param=1, *=0) left to right, then
 * prefer the longer pattern, then fall back to declaration order. Sorted ascending, so iterating
 * the compiled list yields the most specific match first.
 */
function compareSpecificity(a: CompiledPattern, b: CompiledPattern): number {
  const shared = Math.min(a.weights.length, b.weights.length);
  for (let i = 0; i < shared; i++) {
    if (a.weights[i] !== b.weights[i]) return b.weights[i] - a.weights[i];
  }
  if (a.weights.length !== b.weights.length) return b.weights.length - a.weights.length;
  return a.order - b.order;
}

const COMPILED: CompiledPattern[] = [];
ROUTES.forEach((entry, entryIndex) => {
  const paths = Array.isArray(entry.path) ? entry.path : [entry.path];
  paths.forEach((path, aliasIndex) => {
    const { regex, paramNames, weights } = compilePattern(path);
    COMPILED.push({ entry, regex, paramNames, weights, order: entryIndex * 1000 + aliasIndex });
  });
});
COMPILED.sort(compareSpecificity);

// ── Public interface ─────────────────────────────────────────────────────────

export type RouteMatch = {
  entry: RouteEntry;
  params: Record<string, string>;
};

/**
 * First (most specific) route whose pattern and method match. Passing `method: undefined` ignores
 * the method — that is the ownership question, not a dispatch one.
 */
export function matchRoute(method: string | undefined, pathname: string): RouteMatch | null {
  for (const compiled of COMPILED) {
    if (method !== undefined && !compiled.entry.methods.includes(method)) continue;

    const match = compiled.regex.exec(pathname);
    if (!match) continue;

    const params: Record<string, string> = {};
    compiled.paramNames.forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1] ?? '');
    });
    return { entry: compiled.entry, params };
  }
  return null;
}

/** Which owner serves this pathname — the portal's forwarding decision. Null when unclaimed. */
export function ownerOf(pathname: string): RouteOwner | null {
  return matchRoute(undefined, pathname)?.entry.owner ?? null;
}

// ── The one auth/rate-limit prelude ──────────────────────────────────────────

function keyAuthFailureResponse(auth: KeyAuthResult, correlationId: string): Response {
  const status = auth.reason ? httpStatusForKeyDenial(auth.reason) : 401;
  const response = badRequest(
    auth.message || 'Unauthorized',
    status,
    auth.reason || 'UNAUTHORIZED',
    correlationId
  );
  // A refusal on origin grounds opts out of the CORS policy: echoing the rejected origin back
  // would let the offending page read the response, and would undercut the check that just
  // failed. Every other refusal does carry the policy, so a browser can read what went wrong.
  return auth.reason === 'ORIGIN_NOT_ALLOWED' ? withoutCors(response) : response;
}

/** The Billable Customer a successful key auth resolves to; null for public/operator requests. */
function billingFromAuth(auth: KeyAuthResult): BillableAuthContext | null {
  return auth.key && auth.customer ? { key: auth.key, customer: auth.customer } : null;
}

/**
 * The one rate-limit seam, keyed by the entry's declared bucket.
 *
 * `identity` is the authenticated principal when there is one. See `rate-limit.ts` for why that
 * matters more than the address: an agent on a shared cloud egress is throttled by its neighbours
 * when the key is an IP, and walks past the limit entirely when it rotates addresses. A valid
 * operator credential is a server-to-server secret used for bulk work, so it is never held to the
 * bucket at all — a large import would otherwise fail with 429 partway through.
 *
 * The counter is shared (`consumeRateWindow`), not per-isolate. That is the difference between a
 * limit and a number in a config file.
 */
async function enforceRateLimit(
  entry: RouteEntry,
  ctx: RouteContext,
  identity: string | null,
  override?: { bucket: string; multiplier: number }
): Promise<Response | null> {
  const { request, env, correlationId } = ctx;
  const demoLimit = parseInt(env.DEMO_RATE_LIMIT || String(DEFAULT_DEMO_RATE_LIMIT), 10);
  const paidLimit = parseInt(env.PAID_RATE_LIMIT || String(DEFAULT_PAID_RATE_LIMIT), 10);
  const apiLimit = parseInt(String(env.RATE_LIMIT || DEFAULT_RATE_LIMIT), 10);

  const customerId = ctx.billing?.customer.id ?? null;

  const allow = async (bucket: string, limit: number): Promise<boolean> => {
    const name = override?.bucket ?? bucket;
    const ceiling = Math.max(1, Math.round(limit * (override?.multiplier ?? 1)));
    const windows: RateWindow[] = [{ bucket: rateLimitKey(name, request, identity), limit: ceiling }];

    // The per-customer ceiling rides along in the same call. The shard is the Customer, so both
    // windows are already in one Durable Object instance and asking it twice would be latency bought
    // for nothing. This is the limit that actually bounds an account: the per-key limit is walkable
    // by minting another key.
    if (customerId) {
      windows.push({
        bucket: customerRateBucket(customerId),
        limit: customerRateLimit(env, apiLimit),
      });
    }

    const shard = customerId ? customerRateBucket(customerId) : windows[0].bucket;
    return (await consumeRateWindows(env, shard, windows)).allowed;
  };

  switch (entry.rateLimit) {
    case 'none':
    case 'batch':
      return null;

    // Keyless demo mirrors are always per-address throttled — the demo bucket is the abuse control.
    // Nothing authenticates to them, so there is never an identity here.
    case 'demo':
      if (await allow('demo', demoLimit)) return null;
      return rateLimitExceededResponse(correlationId);

    // The paid rail throttles in its own bucket. Sharing the demo bucket meant a paying caller on a
    // shared egress IP could be throttled by unrelated demo traffic; the separate bucket keeps the
    // two independent even when the address is the same.
    case 'paid':
      if (await allow('paid', paidLimit)) return null;
      return rateLimitExceededResponse(correlationId);

    case 'lookup':
    case 'geocode':
    case 'search': {
      if (hasValidBasicAuth(request, env)) return null;

      if (entry.rateLimit === 'search' && isOdaSuggestEnabled(env)) {
        // The portal try-it key is public and shared, so hold it to the stricter demo bucket; every
        // other caller keeps its own. While the suggest flag is off the path is the lookup
        // catch-all, so it keeps the plain bucket.
        const isDemoKey =
          !!env.DEMO_BROWSER_API_KEY && extractApiKey(request) === env.DEMO_BROWSER_API_KEY;
        if (isDemoKey) {
          if (await allow('demo-search', demoLimit)) return null;
          return rateLimitExceededResponse(correlationId);
        }
      }

      if (await allow('api', apiLimit)) return null;
      return rateLimitExceededResponse(correlationId);
    }
  }
}

/** Whether the request presents anything that might resolve to an identity. */
function presentsCredential(request: Request): boolean {
  return Boolean(extractBearerToken(request) || extractApiKey(request));
}

/**
 * How far above its own limit a shared address may go before it is refused outright.
 *
 * A flood guard, not a rate limit. It exists because a request presenting a credential is no longer
 * limited by address — that is the point of identity keying — which would otherwise leave a flood of
 * *rejected* credentials doing unbounded lookup work. Ten times the real limit is far above any
 * legitimate caller, shared egress or not, and far below what a flood needs.
 */
const FLOOD_GUARD_MULTIPLIER = 10;

/**
 * The half of rate limiting that runs before the dialect.
 *
 * The buckets with no identity to key on are limited here for real: the public ones (demo mirrors
 * and the paid rail) and any request arriving without a credential. A credentialed request is
 * deliberately *not* limited by address — that is the bug this split exists to fix — so what it gets
 * here is the flood guard, and its actual limit after the dialect.
 */
async function preAuthRateLimit(entry: RouteEntry, ctx: RouteContext): Promise<Response | null> {
  if (entry.auth === 'public') return enforceRateLimit(entry, ctx, null);
  if (presentsCredential(ctx.request)) {
    return enforceRateLimit(entry, ctx, null, {
      bucket: 'flood',
      multiplier: FLOOD_GUARD_MULTIPLIER,
    });
  }
  return enforceRateLimit(entry, ctx, null);
}

/** The half that runs after it, keyed on whatever the dialect resolved. */
async function postAuthRateLimit(entry: RouteEntry, ctx: RouteContext): Promise<Response | null> {
  // Public entries, and requests that arrived without a credential, were already counted for real
  // before the dialect. Counting them again would halve their limit.
  if (entry.auth === 'public') return null;
  if (!presentsCredential(ctx.request)) return null;

  // A browser key resolves to no identity — deliberately; see `rateLimitIdentity` — so this falls
  // back to the address, which is exactly the limit a public key should have.
  return enforceRateLimit(entry, ctx, rateLimitIdentity(ctx.auth ?? null));
}

export async function runPrelude(entry: RouteEntry, ctx: RouteContext): Promise<Response | null> {
  const limited = await preAuthRateLimit(entry, ctx);
  if (limited) return limited;

  // A rejected credential is returned as rejected. Counting it against the same bucket would turn a
  // mistyped key into a 429, which reads as "you are going too fast" when the truth is "that key is
  // wrong" — and the flood guard above has already bounded the work a flood can do.
  const denial = await authorizeRoute(entry, ctx);
  if (denial) return denial;

  return postAuthRateLimit(entry, ctx);
}

/**
 * The auth dialects, one per entry. Denial is a Response; success lands on the context.
 *
 * Split out of `runPrelude` so the rate limit can run on both sides of it: before, with only the
 * address to go on, and after, with the identity the dialect resolved.
 */
async function authorizeRoute(entry: RouteEntry, ctx: RouteContext): Promise<Response | null> {
  switch (entry.auth) {
    case 'public':
      return null;

    case 'admin':
      if (!checkAdminAuth(ctx.request, ctx.env)) {
        return unauthorizedResponse(ctx.correlationId);
      }
      ctx.isAdmin = true;
      return null;

    case 'admin-optional':
      // Not a gate: the route serves everyone, with extra detail when credentials are valid.
      ctx.isAdmin = checkAdminAuth(ctx.request, ctx.env);
      return null;

    case 'key': {
      const basicAuth = hasValidBasicAuth(ctx.request, ctx.env);
      const auth = await authorizeLookupRequest(ctx.env, ctx.request, basicAuth);
      if (!auth.ok) {
        return keyAuthFailureResponse(auth, ctx.correlationId);
      }
      ctx.auth = auth;
      ctx.billing = billingFromAuth(auth);
      return null;
    }

    case 'search': {
      // Autocomplete accepts an origin-bound Browser key, so this is not the `key` dialect. The
      // ODA suggest flag is a runtime feature gate: while it is off (or ODA_DB is unbound) the
      // path is the lookup catch-all, exactly as it was before the route existed, and takes the
      // lookup gate. Both share the same per-IP bucket.
      const serverCredential = hasValidBasicAuth(ctx.request, ctx.env);
      const auth = isOdaSuggestEnabled(ctx.env)
        ? await authorizeSearchRequest(ctx.env, ctx.request, serverCredential)
        : await authorizeLookupRequest(ctx.env, ctx.request, serverCredential);
      if (!auth.ok) {
        return keyAuthFailureResponse(auth, ctx.correlationId);
      }
      ctx.auth = auth;
      ctx.billing = billingFromAuth(auth);
      return null;
    }

    case 'batch': {
      // Enterprise batch: operator BASIC_AUTH OR a batch-enabled Customer Server key. While the
      // key store is unbound the route stays operator-only, exactly as it did before keys existed.
      if (apiKeysEnabled(ctx.env)) {
        if (hasValidBasicAuth(ctx.request, ctx.env)) return null;

        const auth = await authorizeLookupRequest(ctx.env, ctx.request, false);
        if (!auth.ok) {
          return keyAuthFailureResponse(auth, ctx.correlationId);
        }
        if (!auth.customer?.batchEnabled) {
          return badRequest(
            'Batch requires an Enterprise Customer with batchEnabled',
            403,
            'BATCH_NOT_ENABLED',
            ctx.correlationId
          );
        }
        ctx.auth = auth;
        ctx.billing = billingFromAuth(auth);
        return null;
      }

      if (!checkAdminAuth(ctx.request, ctx.env)) {
        return unauthorizedResponse(ctx.correlationId);
      }
      ctx.isAdmin = true;
      return null;
    }

    case 'projection':
      if (!checkProjectionAuth(ctx.request, ctx.env)) {
        return projectionUnauthorizedResponse();
      }
      return null;
  }
}

/**
 * Resolves the request against the API-owned table, runs the one shared prelude, then the handler.
 *
 * **There is no legacy fallback any more.** Every entry carries a real handler, so the dispatcher
 * has exactly one place a request can be answered from. An entry that somehow carried the `legacy`
 * sentinel would be a 404 rather than a silent fall-through to a second dispatch path.
 *
 * Unclaimed paths (and portal-owned paths, which never reach the API worker in the combined
 * deploy) return the Worker's not-found response.
 */
export async function dispatch(ctx: RouteContext): Promise<Response> {
  const match = matchRoute(ctx.request.method, ctx.url.pathname);

  if (!match || match.entry.owner !== 'api') {
    return badRequest('Not found', 404, 'NOT_FOUND', ctx.correlationId);
  }

  // Shallow copy: the prelude fills auth/rate-limit outcome without mutating the caller's context.
  const routeCtx: RouteContext = { ...ctx };

  const denial = await runPrelude(match.entry, routeCtx);
  if (denial) return denial;

  const handler = match.entry.handler;
  if (!handler || handler === legacy) {
    return badRequest('Not found', 404, 'NOT_FOUND', routeCtx.correlationId);
  }
  return handler(routeCtx);
}

/**
 * A path that is not one of the known surfaces.
 *
 * The catch-all entries — `/admin/*` and `/docs/*` — exist so a request under them is answered
 * rather than falling off the end of the table. The answer is the same 404 the dispatcher gives
 * for an unclaimed path, and it is the same body: a caller that guesses at a path learns nothing
 * about what is behind it.
 */
function handleNotFound(ctx: RouteContext): Response {
  return badRequest('Not found', 404, 'NOT_FOUND', ctx.correlationId);
}
