# Billing invariants CI gate

## Context

The `billing-api` product surface bills by Billable units (successful HTTP 200 lookup/search),
enforces a Customer fuse, and eventually syncs Stripe Billing Meter events. A 2026-07-16
strictness-ratchet pass found recurring classes of defect:

1. `void reportStripeMeter(...)` after a ledger increment — meter events dropped when the isolate
   exited before the fetch completed.
2. Lookup (`worker.ts`) and search (`oda-handlers.ts`) mapped the same `KeyDenialReason` to
   different HTTP statuses (e.g. `KEY_INVALID` → 401 vs 403).
3. Free allowance `1000` and unit price `$0.005` were re-declared across Worker, portal, CLI, and
   UI copy, so env/docs/Checkout could drift.

## Decision

Add a hard-fail CI gate (`scripts/check-billing-invariants.mjs`) wired into `npm run validate` that:

- Forbids `void reportStripeMeter` in `src/` (use `waitUntil` or `await`).
- Forbids ad-hoc KeyDenialReason → status maps outside `httpStatusForKeyDenial` in `src/api-keys.ts`.
- Forbids `$0.005` display literals outside `portal/app/lib/pricing.ts` and docs.
- Requires `DEFAULT_FREE_MONTHLY_ALLOWANCE` in Worker (`src/customer.ts`) and portal
  (`portal/app/lib/pricing.ts`) to stay numerically identical.
- Forbids bare `fuseLimit: 1000` outside allowlisted definition/test/docs sites.

## Ratchet

These rules are already at baseline **0**. New violations fail CI; the gate does not auto-raise.
Further ratchet targets (separate cycles): Zod on projection/KV records; fail-closed vs fail-open
policy on usage DO outages; Checkout→metered only after Stripe webhook confirmation.

## Consequences

Handlers must import `httpStatusForKeyDenial`. Billing display copy must import portal pricing
helpers. Stripe meter reporting must be scheduled with `waitUntil` on request paths.
