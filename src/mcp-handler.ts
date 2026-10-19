import type { AuthInfo } from '@modelcontextprotocol/server';

import { createCanCoderMcpHandler } from './mcp';
import { LOOKUP_SCOPE as MCP_LOOKUP_SCOPE } from './mcp-scopes';
import { unauthorizedMcpResponse } from './oauth-challenge';
import { verifyOAuthAccessToken } from './oauth-token';
import { loadCustomer } from './customer';
import { cachedLookupRiding } from './riding-lookup';
import { resourceMetadataUrl } from './oauth-metadata';
import { configuredPublicOrigins } from './agent-discovery';
import {
  authorizeLookupRequest,
  extractBearerToken,
  httpStatusForKeyDenial,
  SERVER_KEY_PREFIX,
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
import { withoutCors } from './http-headers';
import {
  badRequest,
  rateLimitExceededResponse,
  DEFAULT_RATE_LIMIT,
  DEFAULT_DEMO_RATE_LIMIT,
} from './utils';
import type { RouteContext } from './route-context';

/**
 * `POST /mcp` — the Model Context Protocol surface.
 *
 * **Moved out of \`src/worker.ts\` so the route table can own it.** The behaviour did not change:
 * the same host check, the same origin check, the same credential dialects, the same rate-limit
 * buckets and the same refusals.
 *
 * ## Why this surface has its own rules
 *
 * `/mcp` is the surface an agent discovers the service through, so three things are different here
 * from the REST routes:
 *
 * - **The host is checked.** A request whose `Host` is not this deployment's own origin is a 421,
 *   because a Worker reached under someone else's hostname is a confused-deputy setup rather than
 *   a request for this service.
 * - **The origin is checked, and the refusal carries no CORS headers.** A refusal on origin
 *   grounds must not be readable by the page that caused it — that is what the `withoutCors`
 *   marker is for.
 * - **The demo tier answers a challenge rather than a 429.** A caller who has exhausted the
 *   keyless demo allowance cannot do anything useful with "slow down"; the answer they can act on
 *   is "authorize". A credentialed caller gets a 429, because for them the answer *is* to slow
 *   down.
 */
export async function handleMcpRoute(routeCtx: RouteContext): Promise<Response> {
  const { request, env, correlationId } = routeCtx;

  const requestHost = request.headers.get('Host')?.toLowerCase();
  const localHost = !!requestHost && (
    requestHost === 'localhost' || requestHost.startsWith('localhost:') ||
    requestHost.startsWith('127.0.0.1:') || requestHost.endsWith('.localhost')
  );
  const requestOrigin = routeCtx.url.origin.toLowerCase();
  if (!requestHost || requestHost !== routeCtx.url.host.toLowerCase() ||
      (!localHost && !configuredPublicOrigins(env).includes(requestOrigin))) {
    return badRequest('Unrecognized host', 421, 'MISDIRECTED_REQUEST', correlationId);
  }
  const origin = request.headers.get('Origin');
  if (origin && !localHost && origin.toLowerCase() !== requestOrigin) {
    // A refusal on origin grounds: no CORS headers, so the offending page cannot read why
    // it was refused.
    return withoutCors(
      badRequest('Origin not allowed', 403, 'ORIGIN_NOT_ALLOWED', correlationId)
    );
  }
  const mcpOrigin = routeCtx.url.origin;
  const bearerToken = extractBearerToken(request);
  let auth: KeyAuthResult | null = null;
  // Set when the credential was an OAuth access token rather than a Server key, so the rate
  // limit can key on the user the token acts for instead of falling back to the address.
  let oauthSubject: string | null = null;
  // The verified token, carried to the MCP tool boundary. The server needs the token's
  // scopes to decide whether a call is one the grant covers, and the resource-metadata URL
  // so the refusal it builds advertises the same document the 401 challenge does.
  let oauthAuthInfo: AuthInfo | undefined;
  if (bearerToken) {
    if (bearerToken.startsWith(SERVER_KEY_PREFIX)) {
      auth = await authorizeLookupRequest(env, request, false);
      if (!auth.ok) {
        const status = auth.reason ? httpStatusForKeyDenial(auth.reason) : 401;
        return badRequest(auth.message || 'Unauthorized', status, auth.reason || 'UNAUTHORIZED', correlationId);
      }
    } else {
      // An OAuth access token. The challenge below is what tells a client to go and get one, so
      // this is the first point at which a token is actually used rather than advertised.
      const verified = await verifyOAuthAccessToken(env, bearerToken, mcpOrigin);
      if (!verified.ok) {
        // Every refusal but one answers the same. `no_customer` is the exception, because it
        // is the one a caller can act on differently — the token is fine, the account it names
        // is not. A token whose session has ended is answered exactly as a bad signature is:
        // "authorize again" is the remedy for both, and telling them apart would make this
        // an oracle for probing tokens (ADR-0011).
        return unauthorizedMcpResponse(
          mcpOrigin,
          MCP_LOOKUP_SCOPE,
          verified.reason === 'no_customer'
            ? 'this access token carries no account to bill'
            : 'this access token is not usable here'
        );
      }
      // The Customer comes from a claim added at issuance, not a lookup here: PORTAL_DB is
      // portal-only, and the binding was decided at consent where a person could have seen it.
      const customer = await loadCustomer(env, verified.claims.customerId);
      if (!customer) {
        return unauthorizedMcpResponse(
          mcpOrigin,
          MCP_LOOKUP_SCOPE,
          'the account this access token was issued for no longer exists'
        );
      }
      auth = { ok: true, customer };
      routeCtx.billing = { customer };
      oauthSubject = verified.claims.subject || null;
      // The scopes travel with the request to the tool boundary. They used to be read off
      // the token and then dropped here, so nothing downstream could tell an under-scoped
      // token from a fully-scoped one — and the tool ran anyway.
      oauthAuthInfo = {
        token: bearerToken,
        clientId: verified.claims.clientId,
        scopes: verified.claims.scopes,
        expiresAt: verified.claims.expiresAt,
        resourceMetadataUrl: resourceMetadataUrl(mcpOrigin),
      };
    }
  } else if (request.headers.has('Authorization') || request.headers.has('X-Api-Key')) {
    // A header that is not a usable credential. Answered as a challenge rather than as prose,
    // so a client that has never authorized against us learns how to.
    return unauthorizedMcpResponse(
      mcpOrigin,
      MCP_LOOKUP_SCOPE,
      'the Authorization header is not a credential this server accepts'
    );
  }
  // Keyed on the authenticated key when there is one, and on the address only for the keyless
  // demo tier. An authenticated call used to be bucketed by IP like everything else, so an
  // agent on a shared cloud egress was throttled by its neighbours' traffic — and an agent
  // rotating addresses was not throttled at all.
  const limit = parseInt(
    bearerToken
      ? String(env.RATE_LIMIT || DEFAULT_RATE_LIMIT)
      : String(env.DEMO_RATE_LIMIT || DEFAULT_DEMO_RATE_LIMIT),
    10
  );
  // A Server key is its own identity; an OAuth token acts for a user, and keying it on the
  // address would reintroduce exactly the problem identity keying exists to fix. A token with
  // no subject falls back to the address, which is the honest answer.
  const identity = oauthSubject
    ? `user:${oauthSubject}`
    : rateLimitIdentity(auth);
  const windows: RateWindow[] = [{ bucket: rateLimitKey('mcp', request, identity), limit }];
  const customerId = auth?.customer?.id ?? null;
  if (customerId) {
    // The same ceiling the REST routes apply. Leaving it off this path would make /mcp the way
    // around it — an account could hold its REST traffic under the ceiling and spend the rest
    // here.
    windows.push({
      bucket: customerRateBucket(customerId),
      limit: customerRateLimit(env, limit),
    });
  }
  const shard = customerId ? customerRateBucket(customerId) : windows[0].bucket;
  if (!(await consumeRateWindows(env, shard, windows)).allowed) {
    // Two different refusals, and the difference is what the caller can do about it.
    //
    // With a credential, the answer is to slow down: 429, and waiting is the whole remedy.
    // Without one, the caller has exhausted the demo allowance, and the useful answer is
    // "authorize" rather than "wait" — a 429 would be advice it cannot act on. That is the
    // per-operation challenge: it appears here, where a credential would actually change the
    // outcome, and never in front of the demo tier an agent discovers us through.
    if (!bearerToken) {
      return unauthorizedMcpResponse(
        mcpOrigin,
        MCP_LOOKUP_SCOPE,
        'the demo allowance is exhausted; authorize for metered access'
      );
    }
    return rateLimitExceededResponse(correlationId);
  }
  const response = await createCanCoderMcpHandler({
    request,
    routeContext: routeCtx,
    lookupRiding: cachedLookupRiding,
    auth,
  })
  // The credential is passed in, never read from the headers here: the MCP server performs
  // no token verification of its own, so a request with no credential simply has no
  // credential, and the keyless demo tier stays open.
  .fetch(request, oauthAuthInfo ? { authInfo: oauthAuthInfo } : undefined);
  if (origin && (origin.toLowerCase() === requestOrigin || localHost)) {
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(routeCtx.corsHeaders(origin))) headers.set(name, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  return response;
}
