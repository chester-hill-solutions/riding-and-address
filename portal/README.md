# CanCoder portal

Self-serve Customer portal (signup, org/workspace, invites, Server/Browser keys, usage, Stripe metered Checkout) plus marketing home — deployed as the same Cloudflare Worker as the API.

## Stack

- React Router 7 on Cloudflare Workers (`@cloudflare/vite-plugin`)
- `@chester-hill-solutions/auth` + `auth-d1` + `auth-react-router`
- D1 (`PORTAL_DB` / `cancoder-portal`) for auth + billing
- In-process projection into Worker KV for API keys / Customer fuse (`src/projection-handlers.ts`)

Config lives in [`wrangler.jsonc`](./wrangler.jsonc). Root `npm run deploy` builds and deploys from this directory.

## Local setup

1. Copy [`.env.example`](./.env.example) → `.dev.vars` and fill values (Wrangler reads `.dev.vars`, not `.env`).
2. Install, migrate local D1, run:

   ```bash
   cd portal
   npm install
   npm run db:migrate:local
   npm run dev
   ```

   Combined Worker serves portal (`/`, `/login`, `/app/*`, …) and API (`/api/*`, `/docs`, `/embed.js`, …) on one origin.

   To refresh vendored CHS packages from a sibling checkout, see [`vendor/README.md`](./vendor/README.md).

3. Uncomment `API_KEYS` in `wrangler.jsonc` (and set `PROJECTION_ADMIN_SECRET` in `.dev.vars`) for key minting. Soft free API works with `API_KEYS` unbound.

## Migrations (D1)

```bash
npm run db:migrate:local    # local Miniflare D1
npm run db:migrate:remote   # production PORTAL_DB
npm run db:migrate:staging  # staging env
```

## Stripe webhook

Register `POST {BASE_URL}/api/stripe/webhook` in Stripe and set `STRIPE_WEBHOOK_SECRET` (Worker secret).
Checkout keeps `plan: free` until `checkout.session.completed` activates `metered`.

## Paid Checkout

`PAID_CHECKOUT_ENABLED=false` by default. Free tier (1 000 Billable units / month UTC) works without Stripe. Flip the flag only after the product addendum and licence checklist (see root `CONTEXT.md`).

## Founder admin

Users listed in `FOUNDER_USER_IDS` can toggle Enterprise `batchEnabled` on a Customer via the admin UI (projects to Worker KV).
