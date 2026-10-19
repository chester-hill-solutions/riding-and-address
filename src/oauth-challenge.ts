/**
 * The `WWW-Authenticate` challenges a protected MCP resource returns.
 *
 * **Only the 401 is hand-built, and it has to be.** It answers "there is no usable credential",
 * and it is produced by the Worker *before* the MCP server is involved at all. The server's own
 * authentication gate covers a *whole* handler, which would put a credential in front of the demo
 * tier — and the demo tier is how an agent discovers this service at all.
 *
 * The 403 — a valid token whose scopes do not cover the operation — is the MCP server's own
 * per-operation challenge, declared on the tool (`scopeChallenge`). Only the server knows which
 * operation is being asked for, and it refuses before the operation runs. Its `WWW-Authenticate`
 * has the same shape as the one below.
 *
 * Measured against the library, its own 401 is:
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
