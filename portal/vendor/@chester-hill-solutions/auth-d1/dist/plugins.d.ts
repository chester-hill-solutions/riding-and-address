/**
 * The Better Auth plugins this adapter supports, re-exported so a deployment installs one package
 * rather than reaching into `better-auth` and three `@better-auth/*` packages directly.
 *
 * `jwt` is not decoration. The MCP plugin requires it: it owns the signing key and the `/jwks`
 * endpoint that a resource server verifies access tokens against. `mcp` is the OAuth provider
 * configured for MCP resource binding, and `cimd` is Client ID Metadata Document support, which the
 * MCP 2026-07-28 profile prefers over dynamic client registration.
 *
 * These are re-exported as values, not wrapped. The adapter takes no view on how a deployment
 * configures them; what it owns is the schema they need — see `oauth-schema.ts`, and
 * `oauth-schema.test.ts` for the assertion that the two agree.
 *
 * The option types are derived from the functions rather than re-exported by name, because the
 * published names could not be verified and a wrong one is a compile error for every consumer.
 */
export { magicLink } from "better-auth/plugins";
export type { MagicLinkOptions } from "better-auth/plugins";
export { jwt } from "better-auth/plugins";
export { mcp } from "@better-auth/mcp";
export { oauthProvider } from "@better-auth/oauth-provider";
export { cimd } from "@better-auth/cimd";
export type McpOptions = Parameters<typeof import("@better-auth/mcp").mcp>[0];
export type OAuthProviderOptions = Parameters<typeof import("@better-auth/oauth-provider").oauthProvider>[0];
export type CimdOptions = Parameters<typeof import("@better-auth/cimd").cimd>[0];
