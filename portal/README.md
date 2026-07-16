# Riding Lookup portal

Self-serve Customer portal: signup, org (workspace), invites, Server/Browser keys, usage, Stripe metered Checkout (gated).

## Stack

- React Router 7
- `@chester-hill-solutions/auth` + `auth-postgres` + `auth-react-router`
- Postgres (Railway)
- Worker admin projection API (`/admin/projection/*`) for edge KV keys

## Local setup

1. Copy `.env.example` → `.env` and fill values.
2. From repo root monorepo sibling, ensure CHS auth packages are built:

   ```bash
   bun run --cwd ../chester-hill-solutions/packages/auth build
   bun run --cwd ../chester-hill-solutions/packages/auth-postgres build
   bun run --cwd ../chester-hill-solutions/packages/auth-react-router build
   ```

3. Install and run:

   ```bash
   cd portal
   npm install
   npm run db:migrate
   npm run dev
   ```

4. Worker must have `API_KEYS` bound and `PROJECTION_ADMIN_SECRET` matching `WORKER_PROJECTION_SECRET`.

## Paid Checkout

`PAID_CHECKOUT_ENABLED=false` by default. Free tier (1 000 Billable units / month UTC) works without Stripe. Flip the flag only after the product addendum and licence checklist (see root `CONTEXT.md`).

## Founder admin

Users listed in `FOUNDER_USER_IDS` can toggle Enterprise `batchEnabled` on a Customer via the admin UI (projects to Worker KV).
