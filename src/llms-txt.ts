/**
 * `/llms.txt` and `/llms-full.txt` — the emerging convention for telling language models where the
 * useful, allowed content is.
 *
 * CanCoder already publishes `robots.txt`, a sitemap, an RFC 9727 API catalog, an ARD AI catalog,
 * a UCP profile and a machine-readable terms document. These are the same idea in the format
 * crawlers look for by convention, and they cost nothing to keep honest because every link is
 * derived from the host that served the request.
 *
 * Spec: https://llmstxt.org
 */

import { getAgentQuickstart } from './mcp';

/**
 * The concise index. `/llms.txt` is meant to be short and link out, so it carries no prices or
 * figures that could drift — those live in `/.well-known/cancoder.json`.
 */
export function createLlmsTxt(origin: string): string {
  return `# CanCoder

> Canadian address autocomplete, geocoding, and electoral district lookup API. Resolve a postal
> code, street address, or coordinate pair to a federal, provincial, or combined riding.

CanCoder is a metered HTTP API and a remote MCP server. There is a keyless demo tier, and metered
Server API keys — or scoped OAuth access tokens — for production. Coverage is federal plus all 13
provincial and territorial riding boundaries, with address geocoding from Statistics Canada's Open
Database of Addresses and National Address Register.

## Documentation

- [Agent guide](${origin}/docs/agents.md): connect over MCP and make a first lookup.
- [Authentication](${origin}/auth.md): the credentials, the OAuth authorization server, and the scopes.
- [API reference](${origin}/docs): interactive reference for every route.
- [OpenAPI description](${origin}/api/docs): machine-readable API description.
- [Embed widget](${origin}/docs/embed): drop-in address lookup for a web form.

## Machine-readable

- [Service terms](${origin}/.well-known/cancoder.json): capabilities, price, free tier, data coverage, auth, and error codes.
- [UCP profile](${origin}/.well-known/ucp): UCP business profile with the MCP transport binding.
- [API catalog](${origin}/.well-known/api-catalog): RFC 9727 linkset.
- [AI catalog](${origin}/.well-known/ai-catalog.json): ARD catalog.

## Endpoints

- Riding lookup: ${origin}/api, ${origin}/api/federal, ${origin}/api/combined, and ${origin}/api/{province}
- Address autocomplete: ${origin}/api/search
- Geocoding: ${origin}/api/geocode, ${origin}/api/reverse, ${origin}/api/normalize-address
- Quotes: ${origin}/api/quote
- MCP server: ${origin}/mcp

## Optional

- [Homepage](${origin}/)
- [Sitemap](${origin}/sitemap.xml)
`;
}

/**
 * The fuller document: the index plus the complete agent guide. `llms-full.txt` is for a consumer
 * that wants the content inline rather than following links.
 */
export function createLlmsFullTxt(origin: string): string {
  return `${createLlmsTxt(origin)}
---

${getAgentQuickstart(origin)}`;
}
