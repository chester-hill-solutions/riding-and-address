# Riding Lookup portal

Self-serve Customer portal: signup, org (workspace), invites, Server/Browser keys, usage, Stripe metered Checkout (gated).

## Stack

- React Router 7
- `@chester-hill-solutions/auth` + `auth-postgres` + `auth-react-router`
- Postgres (Railway)
- Worker admin projection API (`/admin/projection/*`) for edge KV keys

## Local setup

1. Copy `.env.example` → `.env` and fill values.
2. Install and run (CHS auth packages are vendored under `vendor/@chester-hill-solutions/`):

   ```bash
   cd portal
   npm install
   npm run db:migrate
   npm run dev
   ```

   To refresh vendored packages from a sibling CHS checkout, see `vendor/README.md`.

3. Worker must have `API_KEYS` bound and `PROJECTION_ADMIN_SECRET` matching `WORKER_PROJECTION_SECRET`
   for key minting / projection. Soft free API can run with `API_KEYS` unbound.

## Stripe webhook

Register `POST {BASE_URL}/api/stripe/webhook` in Stripe and set `STRIPE_WEBHOOK_SECRET`.
Checkout keeps `plan: free` until `checkout.session.completed` activates `metered`.

## Paid Checkout

`PAID_CHECKOUT_ENABLED=false` by default. Free tier (1 000 Billable units / month UTC) works without Stripe. Flip the flag only after the product addendum and licence checklist (see root `CONTEXT.md`).

## Founder admin

Users listed in `FOUNDER_USER_IDS` can toggle Enterprise `batchEnabled` on a Customer via the admin UI (projects to Worker KV).
