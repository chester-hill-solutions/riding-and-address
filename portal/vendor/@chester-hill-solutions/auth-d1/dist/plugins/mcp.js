/**
 * The MCP OAuth provider plugin, behind its own subpath because `@better-auth/mcp` is an optional
 * peer. Importing this module is what requires that package; nothing else in the adapter does.
 *
 * Re-exported as a value, not wrapped. The adapter takes no view on how a deployment configures it;
 * what it owns is the schema it needs — see `oauth-schema.ts`, and `oauth-schema.test.ts` for the
 * assertion that the two agree.
 *
 * The option type is derived from the function rather than re-exported by name, because the published
 * name could not be verified and a wrong one is a compile error for every consumer.
 */
export { mcp } from "@better-auth/mcp";
