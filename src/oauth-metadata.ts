/**
 * The RFC 9728 protected-resource metadata document, and the URL that points at it.
 *
 * **Why this is hand-built.** Better Auth's MCP plugin advertises this document but does not serve
 * it — `@better-auth/mcp` exports only `mcp`, `requireMcpAuth` and `createMcpProtectedRequestHandler`,
 * its plugin registers no PRM endpoint, and its wrapper authenticates a whole handler. Measured, not
 * read: fetching the wrapper at `/.well-known/oauth-protected-resource` returns the same 401 it
 * returns for `/mcp`. The documentation's "served automatically" is wrong.
 *
 * That wrapper is also the reason this is not simply delegated to it. It authenticates the entire
 * handler, which would put a credential in front of the demo tier; the tier is what an agent
 * discovers this service through, so the challenge has to be per-operation instead.
 *
 * **The path is not the bare well-known root.** The wrapper's own challenge points at
 * `/.well-known/oauth-protected-resource/mcp` — the resource-path-inserted alias — so that is the
 * URL a client is told to fetch, and the one that must answer. RFC 9728 §3 also allows the bare root,
 * and both are served, because a client that guesses the other should not get a 404.
 *
 * `resource_signing_alg_values_supported` is deliberately absent. The plugin's document includes it,
 * but nothing in the authorization server's own metadata states which algorithm it signs *resource*
 * tokens with, so a value here would be a guess — and a wrong one would have a client reject every
 * token.
 */
import { MCP_SCOPES } from './mcp-scopes';

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  jwks_uri: string;
  scopes_supported: string[];
  bearer_methods_supported: string[];
}

/** The MCP server's canonical URI — the audience a token must carry (RFC 8707). */
export function mcpResource(origin: string): string {
  return `${origin}/mcp`;
}

/**
 * Where the document lives, and the URL the challenge sends a client to.
 *
 * The resource-path-inserted form is the one the wrapper advertises, so it is the canonical one
 * here; `protectedResourceMetadataPaths` adds the bare root as an alias.
 */
export function resourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource/mcp`;
}

/**
 * The document as a response.
 *
 * `cache-control: public, max-age=300` rather than `no-store`: this document is the same for every
 * caller and a client fetches it before it can do anything, so making it uncacheable would add a
 * round trip to every cold client for no benefit. Five minutes is short enough that a scope change
 * reaches clients while it still matters.
 */
export function protectedResourceMetadataResponse(origin: string): Response {
  return new Response(JSON.stringify(buildProtectedResourceMetadata(origin), null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'public, max-age=300',
    },
  });
}

export function protectedResourceMetadataPaths(): string[] {
  return ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'];
}

/** The route handler. The origin comes from the request, so staging and production each describe
 *  themselves — hard-coding either would make one of them advertise the other's endpoints. */
export function handleProtectedResourceMetadata(ctx: { url: URL }): Response {
  return protectedResourceMetadataResponse(ctx.url.origin);
}

export function buildProtectedResourceMetadata(origin: string): ProtectedResourceMetadata {
  return {
    resource: mcpResource(origin),
    // The authorization server is the portal's Better Auth instance, which lives under a base path —
    // the issuer is `${origin}/api/auth`, not the origin, and a client that assumes otherwise finds
    // nothing at the well-known root.
    authorization_servers: [`${origin}/api/auth`],
    jwks_uri: `${origin}/api/auth/jwks`,
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ['header'],
  };
}
