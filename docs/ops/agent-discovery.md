# Agent discovery deployment notes

The combined Cloudflare Worker serves discovery resources on each configured public hostname.
`PUBLIC_API_HOSTS` in `portal/wrangler.jsonc` lists accepted hosts, currently the custom
`cancoder.chesterhillsolutions.ca` domain and the production `workers.dev` hostname. Discovery
responses use the hostname from the request, while rejecting unconfigured hosts for MCP:

- `/robots.txt` and `/sitemap.xml`
- `/llms.txt` and `/llms-full.txt` (the llmstxt.org convention: a concise index, and the index plus
  the full agent guide)
- `/.well-known/api-catalog` (RFC 9727 linkset)
- `/.well-known/ai-catalog.json` (ARD catalog: `identifier`/`host.displayName` per the ai-catalog data model)
- `/.well-known/mcp/server-card.json` (MCP Server Card, SEP-1649)
- `/.well-known/agent-skills/index.json` and the skill artifact under
  `/.well-known/agent-skills/cancoder-riding-lookup/SKILL.md` (Agent Skills discovery, RFC v0.2.0)
- `/auth.md` (how an agent authenticates — self-contained, since there is no OAuth server)
- `/.well-known/ucp` (UCP 2026-08-25 business profile: one MCP transport binding, no
  capabilities or payment handlers)
- `/.well-known/cancoder.json` (machine-readable terms: capabilities, price, free tier, coverage,
  auth, and error codes — every value read from the constant the Worker and Portal enforce)
- `/mcp` with `lookup_riding` and the `quote_lookup` / `quote_area` offer tools, plus public setup
  notes at `/docs/agents.md`
- The **x402 Bazaar declaration** — every `PAYMENT-REQUIRED` challenge carries
  `extensions.bazaar` (`info.input` / `info.output`) plus `serviceName` and `tags` on the resource, so
  an x402-capable agent can find the paid endpoint in a catalogue. Cataloguing needs the *client* to
  echo the extension inside its payment payload, which the official SDKs do — verified against a real
  one. **Whether it is catalogued is the facilitator's implementation detail**, not ours: CDP does it,
  and the static-key facilitator we are live on is unconfirmed. `cancoder.json`'s `payment` block
  declares the same capability in the meantime.
- Homepage `Link` headers for the API docs, OpenAPI description, and API catalog

Deploy the Worker with the normal production deployment so these routes become available. The
sitemap lists the public marketing page and documentation only. Account pages, authentication,
admin, queue, and billing paths are excluded from crawling. Search crawlers are allowed; model
training crawlers are disallowed. Content Signals are emitted in `robots.txt` as
`ai-train=no, search=yes, ai-input=yes`.

## Markdown for Agents

Implemented in the Worker (`src/markdown-for-agents.ts`), not as a Cloudflare zone toggle. A client
that sends an explicit `Accept: text/markdown` gets a markdown rendering of the HTML page; browsers,
which never ask for markdown, keep getting HTML. Only an explicit ask counts — a wildcard does not —
so no browser is accidentally served markdown. Responses carry `Content-Type: text/markdown` and an
`x-markdown-tokens` hint, and add `Accept` to `Vary`.

## Cloudflare dashboard settings

Add any future custom hostname to `PUBLIC_API_HOSTS` so discovery documents and MCP accept that
hostname.

## DNS-AID

DNS-AID records and DNSSEC signing must be created at the authoritative DNS provider. This repo
does not have DNS credentials or control of the `workers.dev` zone, so no records are published
here. If a custom domain is attached, publish the DNS-AID SVCB/HTTPS records there and enable
DNSSEC with the registrar/provider before advertising the discovery zone.

## Not published

The MCP endpoint supports a rate-limited demo without credentials and the existing metered Server
API key through `Authorization: Bearer`.

**Updated 2026-10-18 — the authorization server now exists, and only half of the discovery is
emitted.** The portal registers Better Auth's `jwt` and `mcp` plugins, so:

| Resource | State |
| --- | --- |
| Authorization server metadata (RFC 8414) | **emitted**, at the issuer-relative path `/api/auth/.well-known/oauth-authorization-server` |
| Signing keys (`jwks_uri`) | **emitted**, at `/api/auth/jwks` |
| Protected resource metadata (RFC 9728) | **not emitted** |
| Dynamic client registration | **not enabled**, deliberately — pre-registration only |
| OIDC discovery (`/.well-known/openid-configuration`) | **not emitted** |

The issuer is `${origin}/api/auth`, not the origin root, because Better Auth's base path is part of
it. The resource-server half — the RFC 9728 document, and the `WWW-Authenticate` challenge on `/mcp`
that points at it — is the part still missing, and **it is the document an MCP client reads first**.
So a client cannot discover this server on its own today; it would have to be handed the issuer.

`/auth.md` *is* published and now says exactly that: the authorization server and its metadata URL,
and that the protected-resource metadata is not published yet. It still documents the demo tier and
the human-provisioned Server key.

**The rule that got us here still holds: a discovery document must not point at something that is not
there.** It is why PRM is absent rather than present-and-empty, and why `/auth.md` hedges rather than
advertises a flow a client cannot complete. The remaining work — PRM, the `/mcp` challenge, and the
consent screen's place in the flow — is in
[`docs/plans/oauth-authorization-server.md`](../plans/oauth-authorization-server.md).

Browser tool registration through **WebMCP** is also not implemented; it would need a real
browser-side integration, not a discovery document. Add either resource when the corresponding
service exists.

The UCP profile declares one MCP transport binding but no service `schema`. A UCP service `schema`
URL is authority-bound: its host must reverse-match the service namespace, so it could only be
served from the canonical `cancoder.chesterhillsolutions.ca` domain and never from the
`*.workers.dev` host, which is a public suffix. Publishing it would therefore break the rule that
discovery resources resolve against the host that served them. Add the schema — an OpenRPC
document under an authority-bound origin — when the profile is ready to pin one host.
