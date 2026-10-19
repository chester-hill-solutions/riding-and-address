/**
 * The OAuth provider plugin, behind its own subpath because `@better-auth/oauth-provider` is an
 * optional peer. Importing this module is what requires that package.
 *
 * Re-exported as a value, not wrapped — the adapter owns the schema the provider needs, not the
 * provider's configuration. See `oauth-schema.ts`.
 */
export { oauthProvider } from "@better-auth/oauth-provider";
