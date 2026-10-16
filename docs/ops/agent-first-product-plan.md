# CanCoder Agent First Product Plan

CanCoder should let an agent discover the service, understand its tools and terms, obtain a useful result, and purchase additional work within explicit authority. An agent should not need a person to create an account or copy an API key before it can try the product. This plan extends the existing MCP lookup and host-aware discovery into a complete discovery, offer, payment, and bounded-query journey.

## Mission

Ship an agent-accessible data service with machine-readable discovery, immediate limited access, transparent scoped offers, and a safe path to paid results. Preserve the existing customer workspace, Server key, and Stripe billing path for organizations that prefer it.

## Current state

- The production Worker exposes a host-aware MCP server with the read-only `lookup_riding` tool on `cancoder.chesterhillsolutions.ca` and the Workers hostname. The MCP server supports a keyless demo and Server API key authentication. At the plan baseline, this deployed implementation was not tracked in `main`; W1 recovers it into source control and reconciles the operational checklist.
- Existing public resources include `robots.txt`, a sitemap, an API linkset, an AI catalog, and `/docs/agents.md`. They describe the API but do not yet declare agent pricing, payment, or purchase capabilities in a complete machine-readable profile.
- The Portal offers 1,000 free monthly billable units and displays a metered price of $0.005 USD per successful lookup/search after that allowance. Paid Checkout is disabled; paid upgrades currently require CHS coordination. The public MCP demo is rate limited to 30 requests per minute per IP.
- Billing is per Customer. The Durable Object usage ledger is canonical, with Stripe Billing Meter delivery asynchronous. A quote-and-accept flow, direct agent payment, and payment receipt ledger do not exist.
- The product has electoral riding boundaries, address/geocoding data, point lookups, and address autocomplete. It has no property listing inventory. `/api/search` is text autocomplete with containers and cursors; it does not perform spatial queries.
- The currently deployed host-aware implementation must be reconciled with the source baseline on `main` before future releases build on it. The production deployment and its source changes should be brought into agreement.

## Outcomes

1. A clean agent can discover CanCoder from either public hostname, understand its capabilities, prices, limits, data coverage, and payment methods, and complete a free riding lookup without setup.
2. An agent can request a scoped offer, compare supported options, and accept one without the price, data vintage, or request inputs changing after acceptance.
3. Paid execution is limited by explicit delegated spending authority, returns a receipt, and is safe to retry without duplicate charges or duplicate results.
4. The first area-search product returns only approved records, supports riding-based queries and then validated arbitrary shapes, and enforces result, compute, and spend limits.
5. Portal copy, UCP profile, MCP tools, HTTP responses, usage records, and published terms agree on price, billable units, limits, and provenance.

## Product principles

### Discover before authenticating

Publish a host-aware UCP profile at `/.well-known/ucp` and keep MCP as the primary tool interface. The profile should identify supported capabilities, service URLs, documentation, data coverage, pricing, free limits, terms, and payment handlers. UCP supports capability discovery and an MCP binding; publish only capabilities CanCoder implements. See the [UCP overview](https://ucp.dev/specification/overview/).

Discovery should also be linked from the homepage, existing API catalog, agent guide, and appropriate public directories. The profile itself is not a global search engine; registration with compatible directories is a separate launch task.

### Try the product immediately

Keep a small anonymous tier for a useful first lookup. Publish its exact rate and limits in machine-readable form. The existing 30 requests per minute per IP is an abuse throttle, not the whole free-plan definition; decide and publish any daily or monthly anonymous cap before advertising an unrestricted demo.

### Offer terms before a paid operation

An offer should state the operation and exact input scope, dataset and vintage, estimated result count, price or maximum price, currency, output cap, expiry, and available payment methods. A quote does not charge or consume billable usage. Acceptance binds to the offered inputs and price ceiling. Negotiation means the agent can choose among defined scope, quality, and output options; prices are published rules, not arbitrary haggling.

### Keep payment authority explicit

The workspace Server key remains an option for customer-managed billing. An account-free agent purchase needs a payment authority such as an agent-controlled wallet with a strict spend policy. Do not give agents open-ended credentials or imply that an MCP server can authorize spending on the user's behalf by itself.

Evaluate x402 as a candidate for direct pay-per-query: it uses HTTP payment requirements and a signed payment payload so a capable agent can pay and retry without a CanCoder account. See the [x402 introduction](https://github.com/x402-foundation/x402/blob/main/docs/introduction.md). UCP Checkout is a better fit for packaged purchases or commerce-style transactions; its standard flow generally expects a user to finish in a trusted UI unless an applicable mandate authorizes completion. See the [UCP Checkout capability](https://github.com/Universal-Commerce-Protocol/ucp/blob/main/docs/specification/shopping/checkout/index.md).

Select one account-free payment path for the first release. Keep payment behind a CanCoder offer/fulfillment boundary so the product can add a second rail later without duplicating pricing, result delivery, or accounting.

### Return evidence with the result

Structured results should say which dataset and boundary vintage were used, where the data came from, how the match was made, confidence when available, and whether the result is approximate or unresolved. Preserve the existing hard failure when a requested dataset vintage is unavailable; never silently substitute another vintage.

## Locked decisions and gates

| Area | Plan decision |
|---|---|
| Tool interface | Extend the existing stateless MCP server and shared HTTP lookup path. Do not build a second lookup implementation. |
| Discovery | Publish a conformant UCP profile, API/AI catalogs, and agent guide on every configured public host. Keep host-derived links behind `PUBLIC_API_HOSTS`. |
| Payment | Keep existing workspace/Stripe billing. Evaluate x402 for one account-free per-query route. Select one direct payment route before implementation; UCP Checkout remains for purchases that genuinely fit commerce checkout. |
| Offers | Quote is free, expiring, idempotently accepted, and bound to exact request parameters, data vintage, and a maximum price. |
| Pricing | Extend the existing canonical price and billing invariant definitions. Establish and publish a distinct unit and cap for area results; do not infer a large-query price from the current point-lookup unit. |
| Area search | Start with riding-bounded queries against an explicitly approved record set. Add GeoJSON Polygon/MultiPolygon in WGS84 after riding queries and limits are stable. |
| Data source | No area result type is assumed. The owner must select the records and approve data source, licensing, attribution, retention, and commercial use before implementation can return or charge for those records. |
| Limits | Set geometry, result-count, response-size, compute, and maximum-spend limits from source constraints and benchmarks. Never leave these unlimited. |
| Release | Reconcile the production host-aware deployment with source control, correct stale operational docs, and deploy via the existing release path. |

### Offer contract sketch

The exact schema is an implementation deliverable. It should be equivalent in meaning to:

```json
{
  "offerId": "opaque-id",
  "operation": "area.search",
  "scope": {
    "boundary": "riding identifier or geometry hash",
    "datasetId": "approved dataset",
    "datasetYear": 2025
  },
  "estimate": { "resultCount": 250, "exact": true },
  "price": { "currency": "USD", "maximum": "1.25" },
  "limits": { "maximumResults": 250, "expiresAt": "timestamp" },
  "paymentMethods": ["declared supported methods"]
}
```

The quote is not itself acceptance. Payment proof or workspace authorization must bind to the offer ID and its immutable parameters. Retries with the same idempotency key must not create another charge or result job.

## Work plan

| ID | Work | Role / tier | Depends on | Done when |
|---|---|---|---|---|
| W0 | Define the area product: record type, source, rights, attribution, allowed use, retention, and buyer-facing terms. | Product/data owner / large | — | A product note names the exact records an area query may return, the source and rights, and the initial billable unit. This is a hard gate for W7–W9. |
| W1 | **Complete 2026-10-16:** recovered the deployed MCP and host-aware discovery implementation into `main`; corrected the stale custom-domain, API key, MCP, and checkout entries in the go-live checklist. | Release engineer / fast | — | Source control contains the deployed agent baseline, and the go-live checklist accurately describes current production hosts. |
| W2 | Record payment and offer architecture in an ADR. Compare UCP Checkout/AP2, x402, and workspace billing for the real target agent ecosystem. | Protocol/security architect / large | W0 | One direct payment rail is selected for v1; spend authority, expiry, idempotency, settlement, failure, refund, receipts, and ledger semantics are defined. |
| W3 | Publish UCP service profile and align its capabilities, payment handlers, and host URLs with MCP/API docs. | Worker/API implementer / mid | W2 | `/.well-known/ucp` validates against the selected UCP version on both public hosts and makes no unsupported claims. |
| W4 | Publish machine-readable capability, price, free-tier, data-coverage, auth, and error information. | Worker/API implementer / mid | W2 | An agent can obtain these terms without scraping marketing copy, and the values match the Portal and Worker configuration. |
| W5 | Add a no-charge, expiring quote for existing point lookups. | Worker/API implementer / large | W2, W4 | Quotes bind to operation, inputs, dataset vintage, price ceiling, and expiry; requesting a quote does not change the usage ledger. |
| W6 | Implement the selected account-free payment adapter for quoted point lookups. | Payments/security implementer / large | W5 | An authorized agent can pay and retry safely; receipts, spend caps, failure handling, and reconciliation pass the release checks. |
| W7 | Specify area-query geometry, record semantics, limits, and output format. | Product/data + spatial architect / large | W0 | Contract defines the record type, riding identifier, WGS84 GeoJSON semantics, containment/intersection rule, caps, paging, and data vintage. |
| W8 | Add riding-bounded estimate and paged search for the approved records. | Worker/spatial implementer / large | W6, W7 | An agent can quote and retrieve records within a riding; result count, output size, and charge cannot exceed the accepted offer. |
| W9 | Add arbitrary Polygon/MultiPolygon quote and search. | Worker/spatial implementer / large | W8 | Valid shapes return only in-scope approved records with deterministic pagination and documented area/vertex/compute limits. |
| W10 | Publish end-to-end agent setup examples and register supported discovery entries. | Documentation/discovery / fast | W3, W4, W6 | A clean compatible agent can discover, try, price, pay, and retrieve using published metadata and examples. |
| W11 | Add monitoring, reconciliation, abuse controls, and launch/backout procedures. | Release verifier / mid | W3–W10 | Operators can see offers, acceptance, paid delivery, failed settlement, spend denials, retries, and reconciliation status; rollout and rollback are documented. |

W0 and W1 can proceed in parallel. W3 and W4 can proceed in parallel after W2. W8 must wait for W7, and W9 must wait for W8. Contract and payment work should be reviewed by a separate security-focused reviewer before production release. A draft W0 product note is at [area-product.md](../plans/area-product.md); it awaits owner approval.

## Technical requirements

### Discovery and onboarding

- Add `/.well-known/ucp` to the combined Worker routing and expose it on both configured hosts.
- Keep the UCP profile, API catalog, AI catalog, MCP server, and agent guide on the same host when discovered from that host.
- Make pricing, units, free limits, supported regions/datasets, data vintage policy, rate limits, payment options, terms, and support contact machine-readable.
- Provide one short example each for free lookup, paid point lookup, riding search, and GeoJSON search when those capabilities ship.
- Register with compatible MCP/UCP/payment directories after the service profile and payment behavior are live. Treat DNS-AID and Cloudflare Markdown for Agents as complementary work, not prerequisites for the basic agent flow.

### MCP and result quality

- Keep `lookup_riding` and add tools for capability/pricing discovery, quote, quote acceptance or execution, and bounded search as the data product is approved.
- Add structured outputs and error codes for unresolved location, unavailable dataset pin, invalid shape, estimate uncertainty, expired offer, payment failure, and exceeded limits.
- Include result provenance and dataset ID/year. Use the existing geocode confidence where returned; do not manufacture a confidence score where no measure exists.
- Ensure MCP and corresponding HTTP operations share validators, pricing, billing, and response semantics.

### Offers, payments, and accounting

- Quote requests are free, bounded, and do not reserve billable quota.
- Each accepted offer is immutable and has an expiry, maximum amount, maximum result count/size, data vintage, and idempotency identifier.
- The payment adapter must verify the offer and payment before delivering paid results. If settlement succeeds but delivery fails, create a durable retry/credit/refund path; do not charge again on retry.
- Keep the existing Durable Object Customer ledger canonical for workspace billing. The payment ADR must define how direct payment receipts coexist with that ledger without inventing duplicate or inconsistent billable counts.
- Extend `docs/adr/0005-billing-invariants-gate.md` and its validation script to prevent price, free allowance, or billable-unit drift across Worker, MCP, UCP, and Portal.
- Resolve licensing, master SaaS terms, attribution, and product addendum before enabling the first paid release, as required by `docs/legal/licence-checklist.md`.

### Bounded-area search

- Do not implement until W0 identifies the dataset. Existing address autocomplete and riding boundary polygons are not a property inventory.
- Implement riding search first, reusing the riding registry and source datasets where appropriate, but add a separate indexed query for the approved records. Existing point-in-polygon lookup is not itself an area export implementation.
- Accept only validated identifiers or WGS84 GeoJSON Polygon/MultiPolygon in the first arbitrary-shape version. Reject unsupported geometry, invalid coordinates, excessive vertices/area, and malformed rings before expensive processing.
- Define whether a record is included by point containment, geometry intersection, or another explicit rule. Return the chosen rule and input geometry hash in the quote and result metadata.
- Return an exact count when affordable; otherwise label the count as an estimate and price against an enforceable maximum. Use deterministic cursor paging for ordinary results. A large export job is a separate, explicitly quoted product.

## Scope boundaries

### Included

- Host-aware UCP and API discovery.
- Immediate bounded anonymous trial.
- Machine-readable terms and offer/accept flow.
- One account-free direct payment path plus the existing workspace-key option.
- Provenance-aware point lookup and approved riding/shape queries.
- Spending, result, geometry, and abuse limits with reconciliation and rollback procedures.

### Deferred

- Multiple direct-payment rails at first launch.
- General-purpose property listings, business listings, or voter data unless a licensed source and product decision explicitly adds them.
- Unlimited bulk exports, open-ended subscriptions, or arbitrary negotiated price overrides.
- OAuth account linking unless the selected payment or UCP capability actually requires it.
- Browser WebMCP registration and consumer-facing checkout UI unless product research shows they are needed for the target agents.

## Risks and controls

| Risk | Control |
|---|---|
| The desired area records are not available for commercial redistribution. | W0 is a hard gate. Do not expose or charge for an unapproved record set. |
| Agents lack a funded wallet or payment-capable client. | Keep the free tier and workspace Server key path; advertise direct payment only to compatible clients. |
| Payment replay or retry creates a duplicate charge. | Bind payment to a short-lived offer, persist receipts, enforce idempotency, and test retries and settlement failure. |
| A complex shape creates unbounded compute or response cost. | Validate geometry and enforce area, vertex, execution, result, response-size, and spend caps. |
| Portal, Worker, and agent catalog prices diverge. | Use the canonical pricing helper and extend the existing billing-invariant gate. |
| UCP metadata claims unsupported behavior. | Validate the profile against the selected UCP version and publish only live capabilities/payment handlers. |
| Deployed source and `main` disagree. | W1 reconciles the current deployment before further production changes. |

## Acceptance and verification

The product is ready when a clean compatible agent can:

1. Discover the service and its profile through either public hostname.
2. Read supported tools, data coverage, terms, price, free allowance, and payment choices as structured data.
3. Complete a bounded free lookup without creating an account or receiving an API key.
4. Request a quote without being charged or consuming billable usage.
5. Accept an offer and receive a result without exceeding its amount, result, data vintage, and scope limits.
6. Retry safely without a duplicate charge and receive a machine-readable receipt/result status.
7. Search only the approved data set within a riding and, after W8, a validated arbitrary shape.

Implementation verification should include `bun run build`, `bun run validate`, UCP profile validation, both-host discovery checks, MCP tool calls, a clean-agent walkthrough, quote non-billing, payment idempotency/reconciliation, wallet/spend-ceiling checks, geometry edge cases, pagination, and rollback verification. No implementation or test is implied by this plan document.

## Release sequence

1. Reconcile source and production baseline; define area data and commercial scope.
2. Approve the payment/offer ADR and publish UCP plus structured terms.
3. Ship quote and account-free payment for the existing point lookup; verify the full agent journey.
4. Ship riding-bounded search for approved records.
5. Ship arbitrary GeoJSON search with strict limits.
6. Register directories, publish agent examples, monitor launch, and review conversion, errors, spend denials, and data quality.

## Engineering references

- [Agent discovery operations](agent-discovery.md)
- [Area product W0 definition](../plans/area-product.md)
- [Go-live checklist](go-live-checklist.md)
- [CanCoder domain context](../../CONTEXT.md)
- [Billing ledger decision](../adr/0002-do-ledger-stripe-eventual.md)
- [Dataset vintage decision](../adr/0004-dataset-versioning-no-dual-serve.md)
- [Billing invariant gate](../adr/0005-billing-invariants-gate.md)
- [ODA address and autocomplete contract](../oda-geolocation-contract.md)
- [Commercial data licence checklist](../legal/licence-checklist.md)
