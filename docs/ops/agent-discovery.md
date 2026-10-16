# Agent discovery deployment notes

The combined Cloudflare Worker serves discovery resources on each configured public hostname.
`PUBLIC_API_HOSTS` in `portal/wrangler.jsonc` lists accepted hosts, currently the custom
`cancoder.chesterhillsolutions.ca` domain and the production `workers.dev` hostname. Discovery
responses use the hostname from the request, while rejecting unconfigured hosts for MCP:

- `/robots.txt` and `/sitemap.xml`
- `/.well-known/api-catalog` (RFC 9727 linkset)
- `/.well-known/ai-catalog.json` (ARD catalog)
- `/mcp` with a read-only `lookup_riding` tool and public setup notes at `/docs/agents.md`
- Homepage `Link` headers for the API docs, OpenAPI description, and API catalog

Deploy the Worker with the normal production deployment so these routes become available. The
sitemap lists the public marketing page and documentation only. Account pages, authentication,
admin, queue, and billing paths are excluded from crawling. Search crawlers are allowed; model
training crawlers are disallowed. Content Signals are emitted in `robots.txt` as
`ai-train=no, search=yes, ai-input=yes`.

## Cloudflare dashboard settings

Enable **Markdown for Agents** for the production zone in Cloudflare's AI Crawl Control settings
to negotiate Markdown from HTML pages when a client sends `Accept: text/markdown`. This requires
zone dashboard access and cannot be enabled from this repository. Add any future custom hostname
to `PUBLIC_API_HOSTS` so discovery documents and MCP accept that hostname.

## DNS-AID

DNS-AID records and DNSSEC signing must be created at the authoritative DNS provider. This repo
does not have DNS credentials or control of the `workers.dev` zone, so no records are published
here. If a custom domain is attached, publish the DNS-AID SVCB/HTTPS records there and enable
DNSSEC with the registrar/provider before advertising the discovery zone.

## Not published

The MCP endpoint supports a rate-limited demo without credentials and the existing metered Server
API key through `Authorization: Bearer`. The service does not currently operate an OAuth
authorization server, accept OAuth protected-resource metadata, provide agent self-registration,
or register browser tools through WebMCP. OAuth/OIDC discovery, OAuth protected-resource metadata,
`auth.md`, an MCP Server Card, and an Agent Skills index are therefore not emitted; publishing
placeholder metadata would direct agents to unsupported flows or endpoints. Add these resources
when the corresponding service is implemented.
