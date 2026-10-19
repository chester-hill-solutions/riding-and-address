/**
 * The Better Auth plugins this adapter supports, re-exported so a deployment installs one package
 * rather than reaching into `better-auth` directly.
 *
 * What is here is what every deployment can resolve: both of these come from `better-auth` itself,
 * which this package already depends on. The three OAuth provider plugins live behind their own
 * subpaths — `./plugins/mcp`, `./plugins/oauth-provider`, `./plugins/cimd` — because they come from
 * three `@better-auth/*` packages that are OPTIONAL peers.
 *
 * The split is the point, not tidiness. `peerDependenciesMeta` has always marked those three
 * optional, but one `./plugins` entry re-exporting all five made them mandatory in practice:
 * importing `./plugins` for `magicLink` resolved all three, so a deployment that does not run the
 * OAuth provider could not build. Metadata that promises an optionality the code does not deliver is
 * worse than no metadata, because it is the metadata people trust.
 *
 * `jwt` stays here with `magicLink` because it also comes from `better-auth`. It is not decoration
 * for deployments that do use the MCP plugin: that plugin requires it, because `jwt` owns the signing
 * key and the `/jwks` endpoint a resource server verifies access tokens against.
 */
export { magicLink } from "better-auth/plugins";
export type { MagicLinkOptions } from "better-auth/plugins";
export { jwt } from "better-auth/plugins";
