# Spike: CHS auth + Stripe Billing Meters (W0-6)

## Verdict

| Dependency | Status | Notes |
|---|---|---|
| `@chester-hill-solutions/auth*` + Postgres on Railway RR7 | **Pass (assumed)** | Packages are the CHS standard for RR7 portals; this repo has no vendor checkout yet — portal will depend on published GH Packages. Worker stays key-auth only (no session cookies on API). |
| Stripe Billing Meters | **Pass (assumed)** | Use Stripe Billing Meters + meter events from the Worker/ledger sync path. Create meter `riding_lookup_api_call` (Billable unit). Paid Checkout stays behind `PAID_CHECKOUT_ENABLED` until product addendum. |

## Env / secrets (portal)

- `DATABASE_URL` — Postgres
- `BETTER_AUTH_SECRET` / CHS auth secrets per package docs
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `STRIPE_METER_EVENT_NAME` — e.g. `riding_lookup_api_call`
- `WORKER_PROJECTION_URL` — Worker base URL
- `WORKER_PROJECTION_SECRET` — shared with Worker `PROJECTION_ADMIN_SECRET`
- `RESEND_API_KEY` (or CHS email provider)
- `PAID_CHECKOUT_ENABLED=false` until addendum

## Env / secrets (Worker)

- `API_KEYS` KV binding enabled
- `API_KEY_USAGE` DO binding (Customer ledger)
- `PROJECTION_ADMIN_SECRET`
- `STRIPE_SECRET_KEY` (meter events) — optional until paid flag on
- `STRIPE_METER_EVENT_NAME`
- Defaults: free allowance `1000` / month UTC; unit price documented as `$0.005` in Stripe Price

## Fallback if spike fails in a real environment

Do not invent a second auth stack. Escalate to Orchestrator: either vendor CHS packages into the monorepo link or pause portal Wave 2 until Packages auth works. CLI + projection can still ship Wave 1 without portal UI.
