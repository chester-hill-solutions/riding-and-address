# Strictness ratchet review — 2026-07-16

Cycle against the `billing-api` branch (money + API-key auth). Investigations:
[billing money](727b24cf-21c6-4b63-8a3f-d90557e395ba),
[handlers](aad81989-5438-4858-8c22-15c3b98ca599),
[types](ce26f23c-be00-4676-b523-563fdfbfd98e),
[DRY/consistency](b7d88def-e390-4908-9135-b73de5da3c52).

## Shipped this cycle (Tier 0/1 + gate)

| Finding | Fix | Gate |
|---|---|---|
| Stripe meter `void` dropped on isolate exit | `waitUntil` / await via `RecordBillableOptions` | `void-stripe-meter` |
| Batch fuse: unbilled successes still returned | Redact remaining items after first `FUSE_EXCEEDED` | (behavior + tests next) |
| Lookup vs search key-denial status drift | `httpStatusForKeyDenial` + shared use | `ad-hoc-key-status` + unit matrix |
| Cross-workspace key revoke | Ownership check on `apiKeyMirror` before revoke | (portal; review checklist) |
| Allowance / `$0.005` literal drift | Shared constants + pricing helpers | allowance + price + fuse literals |

Gate: `npm run check:billing-invariants` (also in `validate`). ADR: `docs/adr/0005-billing-invariants-gate.md`.

## Backlog — needs greenlight (Tier 2 / decisions)

| Severity | Item | Notes |
|---|---|---|
| High | ~~Checkout sets `plan: metered` before payment succeeds~~ | Fixed: webhook activates metered |
| High | ~~Portal members can mint keys / change fuse / start checkout without owner role~~ | Fixed: `requireOwnerOrAdmin` |
| High | ~~Usage DO fail-open on outage (`consumeMonthlyQuota` → `allowed: true`)~~ | Fixed: fail-closed when hard fuse |
| Medium | Projection bodies unvalidated (`request.json()` cast) | Zod schemas on projection PUT/POST |
| Medium | Batch status `/batch/:id` not customer-scoped | Tenant-scope queue records |
| Medium | Stripe meter has no outbox/reconciliation | ADR 0002 claims eventual — needs durable retry |
| Medium | Portal Postgres ↔ Worker dual-write duplicated ×4 | Extract `syncCustomerBilling` helper |
| Low | Error JSON envelope (`timestamp`) inconsistent | Shared error helper |

## Review checklist (human)

- [x] Confirm fail-open vs fail-closed when `API_KEY_USAGE` DO is down
      → **Fail-closed** for hard monthly fuse (`monthlyLimit > 0`); fail-open when
      unlimited / soft-warn (`monthlyLimit <= 0`). Daily browser caps remain fail-open.
- [x] Confirm Checkout may not activate metering until `checkout.session.completed` (or equivalent)
      → Portal keeps `plan: free` at Checkout start; `api/stripe/webhook` sets `metered`.
- [x] Confirm non-owner portal roles cannot mint Server keys
      → `requireOwnerOrAdmin` on keys, billing, and fuse settings actions.
