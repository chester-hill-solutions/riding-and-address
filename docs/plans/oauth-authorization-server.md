# OAuth authorization server — scoping

**Status: plan. Nothing built. This is the next big discovery unlock, not a listing.**

Companion to [`mcp-payment-elicitation.md`](mcp-payment-elicitation.md) (the human path, shipped),
[ADR 0007](../adr/0007-account-free-x402-payments.md) (the autonomous rail) and
[`agent-discovery.md`](../ops/agent-discovery.md) (what is published, and what is deliberately not).

## 1. Why

**ChatGPT, Claude, Cursor, VS Code, Zed and the rest expect OAuth for remote MCP servers.** Today they
would try to walk an OAuth flow against us and fail, because there is no authorization server — a
deliberate decision recorded in `/auth.md` and in the discovery inventory. One implementation unlocks
every one of those clients at once. That is a bigger reach than any directory listing, and it is a
project rather than a submission.

It also replaces the `purchase` tool's URL hand-off for clients that can do OAuth natively: instead of
sending a human to a sign-up page, the client authenticates the user and gets a token.

**What it does not do:** bring demand. It makes us *connectable*, not *found* — and the product still
needs buyers who are looking.

## 2. What the spec requires

From the MCP specification, revision **2026-07-28** — which splits the work across two roles we would
both play.

**As the resource server (the MCP server), MUST:**

- implement **OAuth 2.0 Protected Resource Metadata** (RFC 9728) at
  `/.well-known/oauth-protected-resource`, advertising the authorization server(s), `resource`, and
  `scopes_supported`;
- answer an unauthenticated request with **401** and
  `WWW-Authenticate: Bearer resource_metadata="…"`, including `scope=` guidance;
- validate that a token was issued **for us as the audience** (RFC 8707), returning **401** for
  invalid or expired tokens and **403** with `error="insufficient_scope"` for insufficient scope;
- accept tokens only in the `Authorization: Bearer` header — never a query string.

**As the authorization server, MUST:**

- implement OAuth 2.1 with the security measures for both confidential and public clients;
- provide **at least one** discovery mechanism — **RFC 8414** authorization-server metadata or
  **OIDC Discovery** (clients must support both);
- support the `resource` parameter (RFC 8707) on authorization *and* token requests;
- emit `iss` in authorization responses and advertise
  `authorization_response_iss_parameter_supported` (RFC 9207 — a SHOULD today, expected to become a
  MUST);
- accept a client id obtained by **one of three** mechanisms: **Client ID Metadata Documents**, 
  **pre-registration**, or Dynamic Client Registration.

**A correction worth recording.** I earlier said ChatGPT *requires* dynamic client registration. That
came from a conference talk, not the spec. The spec says DCR is **deprecated**, retained for backwards
compatibility, and that the preferred mechanism is **Client ID Metadata Documents** — where the client
uses an HTTPS URL as its `client_id` and the authorization server fetches metadata from it. That
changes the design materially: DCR is the option with the open-registration abuse surface, and it is
the one we should *not* reach for first.

## 3. What already exists to build on

Nothing here is new infrastructure:

- **Customers, Users and Server keys** — the identity and billing model is already there.
- **Stripe billing** with a free allowance, a meter and fuses.
- **Portal authentication** (`AUTH_SECRET`, Better Auth) — a user can already sign in.
- **The MCP server** at `/mcp`, with a host check and a rate-limit bucket.
- **The discovery documents**, which currently state that no OAuth server exists — and must stop
  saying so.

## 4. The design, in outline

**Token → User → Customer.** An OAuth access token identifies a *User*, and a User belongs to a
Customer. That is the whole mapping: an OAuth-authenticated agent spends the Customer's allowance and
metered billing exactly as a Server key does today. No new billing path, no second ledger.

**Consent is the point.** A human authorises the agent once, in the portal, and can revoke it. That is
what OAuth buys over handing out a key — and it is why this is the *human/org* path, not the autonomous
one.

**Two auth models, kept apart.** x402 stays account-free and untouched: it is for an agent with a
wallet and no human. OAuth is for an agent acting for an account. They share the offer, the price and
the delivery path, and nothing else.

## 5. Client registration — the decision with teeth

| Mechanism | Spec status | Our exposure |
|---|---|---|
| **Client ID Metadata Documents** | SHOULD support; preferred | An outbound fetch of a client-supplied URL — needs SSRF care, and the spec has a section on it |
| **Pre-registration** | Acceptable | We issue client ids by hand; safest, worst for onboarding |
| **Dynamic Client Registration** | MAY; **deprecated** | Open registration — spam clients, and a surface to rate-limit and expire |

**Recommended:** CIMD plus pre-registration. Skip DCR initially, and say so — it is the mechanism with
the abuse surface and the one the spec is retiring.

## 6. Limits that must never be unlimited

- **Token lifetime**, and whether refresh tokens are issued at all (the spec leaves it to us).
- **Scopes** — the smallest set that does anything, with step-up for more.
- **Registered clients** per Customer, and **DCR clients** if ever enabled.
- **Authorization requests** per client and per IP (the consent screen is a page a stranger can hit).
- **CIMD fetches**: one per client id, cached, with a timeout and a size cap.

## 7. Decisions — answered 2026-10-18

| # | Decision | Answer |
|---|---|---|
| 1 | Build or buy the authorization server? | **Build it ourselves** — no monthly cost, no third party holding users' logins, and we own the consent screen and token issuing. The cost is the security surface, which is why §6's limits are not optional |
| 2 | Which discovery mechanism? | **Both** RFC 8414 and OIDC Discovery. Clients must support both, so we serve both |
| 3 | Registration mechanism? | **CIMD + pre-registration**, no DCR (§5). CIMD is the spec's preference and pre-registration covers clients that cannot do it |
| 4 | Scopes | **Area search gets its own scope.** A lookup is half a cent; an area search can be $8, and one approval should not quietly authorise both |
| 5 | Refresh tokens | **Yes, long-lived and revocable**, with rotation. An agent that must re-consent hourly is worse than one that cannot work |
| 6 | Where consent lives | **The portal**, beside keys and billing, so revocation is in one place |
| 7 | Replace the `purchase` tool, or sit beside it? | **Sit beside.** `purchase` serves the clients that cannot do OAuth, which is most of them today |

## 8. Sequencing

**A correction to this section, forced by decision 1.** It previously said the resource-server half
"can ship without an authorization server". With the authorization server built in-house, that is not
true of the *published* half: protected-resource metadata points clients at an authorization server,
and the 401 challenge carries its URL. Publishing either before the authorization server can answer
would break the rule this repo has kept throughout — **a discovery document must not point at
something that is not there.** So the two halves are built and turned on together.

1. **Authorization-server side first** — metadata, authorization code + PKCE, token endpoint, the
   consent screen, revocation. It is the bigger piece and the other half is inert without it.
2. **Resource-server side** — protected-resource metadata, the 401 challenge with `WWW-Authenticate`,
   audience validation, `403` on insufficient scope. Written and tested alongside, **enabled at the
   same time**, never before.
3. **Client registration** — pre-registration first (a client id we issue), then CIMD.
4. **Refresh and step-up**, once the basic flow is exercised by a real client.
5. **Then** the directory submissions that need it — the OpenAI app and the MCP registries.

## 9. Acceptance

- A client that supports OAuth completes the flow against a test deployment and calls `lookup_riding`
  with a bearer token, without anyone pasting a key.
- An unauthenticated request gets `401` with `WWW-Authenticate` pointing at protected-resource metadata.
- A token minted for another audience is refused; an expired one is refused; an under-scoped one gets
  `403` with `insufficient_scope`.
- Revoking in the portal stops the agent on its next request.
- The Customer's allowance and metering behave exactly as they do for a Server key — proven by a test
  that spends through both.
- `/auth.md` and the discovery inventory no longer say there is no authorization server.

## 10. Open items

- **Consent for a headless client.** OAuth assumes a browser at least once. What does a CI job or a
  server-side agent do — pre-registration plus client credentials? The spec notes `client_credentials`
  clients may abort on scope errors, so the shape exists, but it is a second flow to design.
- **The `WWW-Authenticate` scope for our tools.** One read scope is easy; area search and its result
  caps are a separate authorisation question, and the step-up flow makes it visible to users.
- **`/mcp` currently accepts a Server key.** The token path must not weaken it: both must resolve to a
  Customer, and neither should become a way to bypass the other's limits.
- **Whether to publish an `offline_access` scope.** The spec says a resource server should *not* ask
  for it, and refresh tokens are the authorization server's discretion.
