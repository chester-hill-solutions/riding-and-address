/**
 * The `WWW-Authenticate` challenges a protected MCP resource returns.
 *
 * **This is hand-built because the library cannot do a per-operation challenge.**
 * `createMcpProtectedRequestHandler` authenticates a *whole* handler, which would put a credential in
 * front of the demo tier — and the demo tier is how an agent discovers this service at all. Measured
 * against the library, its own 401 is:
 *
 *   WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp", scope="…"
 *   body: {"jsonrpc":"2.0","error":{"code":-32000,"message":"missing authorization header"},"id":null}
 *
 * The shape here matches it, deliberately: a client written against that output should not be able
 * to tell which of us answered. The JSON-RPC envelope matters — an MCP client parses it, and a bare
 * text body would leave it reporting a protocol error rather than an authorization one.
 *
 * Three statuses, and they are not interchangeable:
 *
 *   - **401** with no `error`: no usable token. The client should authorize, then retry.
 *   - **403** with `insufficient_scope`: the token is fine, the scopes are not. The client should
 *     step up — re-authorize asking for more — rather than start over.
 *   - **429**: too many requests *with* a usable credential. Nothing to authorize; wait.
 */
import { resourceMetadataUrl } from './oauth-metadata';

/** Escape a value for a header `quoted-string` (RFC 7230 §3.2.6). */
function quote(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function parameters(entries: ReadonlyArray<[string, string | undefined]>): string {
  return entries
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key}="${quote(value)}"`)
    .join(', ');
}

/**
 * The challenge for a request with no usable token.
 *
 * `scope` is included because MCP asks a server to say which scopes the current operation needs, so
 * a client requests those rather than everything and lets the user discover the surplus at consent.
 */
export function bearerChallenge(origin: string, scope?: string): string {
  return `Bearer ${parameters([
    ['resource_metadata', resourceMetadataUrl(origin)],
    ['scope', scope],
  ])}`;
}

/** The challenge for a valid token that does not carry the scopes the operation needs. */
export function insufficientScopeChallenge(origin: string, scope: string): string {
  return `Bearer ${parameters([
    ['error', 'insufficient_scope'],
    ['scope', scope],
    ['resource_metadata', resourceMetadataUrl(origin)],
  ])}`;
}

function jsonRpc(message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null });
}

/**
 * 401 — no usable credential. The body names the required scopes too, so a client that reads the
 * body rather than the header still learns what to ask for.
 */
export function unauthorizedMcpResponse(origin: string, scope: string, message: string): Response {
  return new Response(jsonRpc(`${message}. Required scope: ${scope}`), {
    status: 401,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'www-authenticate': bearerChallenge(origin, scope),
      'cache-control': 'no-store',
    },
  });
}

/**
 * 403 — the token is valid and under-scoped. Every scope the operation needs is named in one
 * challenge, because challenging one at a time forces a separate authorization round trip each.
 */
export function insufficientScopeMcpResponse(origin: string, scope: string): Response {
  return new Response(jsonRpc(`insufficient scope; this operation needs: ${scope}`), {
    status: 403,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'www-authenticate': insufficientScopeChallenge(origin, scope),
      'cache-control': 'no-store',
    },
  });
}
