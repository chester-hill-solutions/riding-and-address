# ADR 0010 — Client registration for MCP: CIMD over `fetch`

**Status:** accepted, implementation pending.
**Date:** 2026-10-19.
**Context:** a real MCP client cannot connect to `/mcp` today, and registration is the only thing
missing. The flow itself is verified end to end — discovery, PKCE, consent, token, tool call.

## The problem

A real client has no session on our portal, so it must obtain a `client_id` itself. We support none of
the three mechanisms:

| Mechanism | State |
| --- | --- |
| Dynamic Client Registration (RFC 7591) | off — no `registration_endpoint` is published |
| Client ID Metadata Documents | not installed — no `client_id_metadata_document_supported` |
| Pre-registration | works, but only for a client a human registered |

The plan chose CIMD and pre-registration, deliberately not DCR, because DCR is deprecated and its open
registration is an abuse surface we would own.

## The contract, and the two wrong readings of it

`@better-auth/cimd` requires the transport to "resolve the hostname exactly once, reject RFC 6890
special-use addresses, pin the approved address for the connection, and refuse redirects", and says
these "cannot be implemented by wrapping the standard Fetch API after DNS resolution".

**First reading — accept a documented gap.** `fetch` resolves DNS internally with no address pinning,
so the requirement looked unachievable. Wrong, because it treated "cannot be done with `fetch`" as
"cannot be done".

**Second reading — hand-roll a socket client.** Resolve via DNS-over-HTTPS, check the addresses, dial
the approved one with `cloudflare:sockets` `connect()`, speak HTTPS ourselves. This is also wrong, and
the Cloudflare documentation says so in two places:

- `connect()` takes a `hostname`, not an address. It resolves the name itself, so it does not pin
  anything either — the second reading would have produced a hand-written TLS client that satisfies
  none of the requirement it was written for.
- "If you need to connect to addresses on port `80` or `443` to make HTTP requests, use `fetch`."

**Third reading — the one the documentation supports.** The platform already blocks the addresses the
requirement exists to protect:

> `proxy request failed, cannot connect to the specified address` — Your socket is connecting to an
> address that was disallowed. Examples of a disallowed address include **Cloudflare IPs, `localhost`,
> and private network IPs**.

That applies to `connect()`, and `fetch` cannot target an IP address at all ("requests can only be
made to URLs, not to IP addresses directly").

## Decision

**Implement CIMD over `fetch`**, and rely on the platform for the address block.

Of the four requirements:

| Requirement | How it is met |
| --- | --- |
| reject RFC 6890 special-use addresses | **the platform** — Cloudflare IPs, `localhost` and private network IPs are refused, documented |
| refuse redirects | **us** — `redirect: 'error'` |
| 5 KB read cap | **us** — we stop reading at the cap and refuse the document |
| HTTPS only | **us** — reject any other scheme before fetching |
| resolve once, pin the approved address | **not done, and not applicable** |

The last row is the deviation, and the reasoning is worth stating rather than burying: pinning protects
against a name that resolves differently between the check and the connection. **We never resolve the
name and never approve an address**, so there is nothing to pin and nothing to rebind to — and the
address a rebind would target is refused by the platform at connection time regardless. The property
the requirement exists to produce is present; the mechanism it names is not.

## What the implementation must be tested against

A guard is only worth its runtime if it can fail, and the tests are the deliverable as much as the code:

- a **private IP literal** as the client-id host (`127.0.0.1`, `10.0.0.1`, `169.254.169.254`);
- an **IPv6** literal, including a mapped form (`::ffff:127.0.0.1`);
- a **redirect** to a private address, which must not be followed;
- a **response over 5 KB**, which must be refused rather than read;
- a **non-HTTPS** scheme, and a client id with a query or fragment;
- a **timeout**, which must fail closed rather than hang the authorization request.

The platform-blocked cases cannot be tested from inside a Worker — the block *is* the platform — so they
are asserted against the documented behaviour and recorded as such rather than pretended to be covered
by a test that would pass either way.

## Consequences

- **No hand-rolled TLS client**, and no new runtime surface. The earlier draft would have added one for
  no benefit.
- **A known, narrow deviation from a MUST**, with its reasoning and its compensating control written
  down here rather than in a code comment.
- **DCR stays off**, so the abuse surface the plan wanted to avoid is still avoided, and pre-registered
  clients remain available for anything CIMD cannot serve.
