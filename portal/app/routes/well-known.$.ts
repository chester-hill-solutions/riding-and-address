import type { Route } from './+types/well-known.$';
import { getAuth } from '~/lib/auth.server';

/**
 * Every `/.well-known/*` path the API worker does not own, forwarded to the auth handler.
 *
 * **This exists because a real client told us it was missing.** OpenCode, connecting to staging as an
 * MCP client, asked for:
 *
 *   /.well-known/oauth-protected-resource/mcp          200  (served by the API worker)
 *   /.well-known/oauth-authorization-server/api/auth   404  <- the RFC 8414 path-inserted form
 *   /.well-known/openid-configuration/api/auth         404  <- the OIDC path-inserted form
 *   /api/auth/.well-known/openid-configuration         404
 *
 * Better Auth serves authorization-server metadata at **both** RFC 8414 placements, but the portal
 * only routed `/api/auth/*` to it, so the path-inserted form died at the router. A client that tries
 * that placement first — as this one did — finds nothing and reports that the server needs a login it
 * cannot perform. MCP requires clients to support both discovery mechanisms, which is why a server
 * should answer both.
 *
 * `/api/auth/.well-known/openid-configuration` is deliberately *not* fixed here: Better Auth serves
 * OIDC discovery only when the `openid` scope is configured, and we do not issue identity scopes. A
 * client falls back to RFC 8414, which is the mechanism we do provide.
 *
 * Ownership: the API worker owns the protected-resource metadata paths, so this never sees them —
 * `ownerOf` decides before the portal is reached. Everything else under `/.well-known/` lands here.
 */
async function forward(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export async function loader({ request }: Route.LoaderArgs) {
  return forward(request);
}

export async function action({ request }: Route.ActionArgs) {
  return forward(request);
}
