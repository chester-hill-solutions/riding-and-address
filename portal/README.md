# CanCoder portal

Self-serve Customer portal (signup, org/workspace, invites, Server/Browser keys, usage, Stripe metered Checkout) plus marketing home — deployed as the same Cloudflare Worker as the API.

## Stack

- React Router 7 on Cloudflare Workers (`@cloudflare/vite-plugin`)
- `@chester-hill-solutions/auth` + `auth-d1` + `auth-react-router`
- D1 (`PORTAL_DB` / `cancoder-portal`) for auth + billing
- In-process projection into Worker KV for API keys / Customer fuse (`src/projection-handlers.ts`)

Config lives in [`wrangler.jsonc`](./wrangler.jsonc). Root `bun run deploy` builds and deploys from this directory.

## Local setup

1. Copy [`.env.example`](./.env.example) → `.dev.vars` and fill values (Wrangler reads `.dev.vars`, not `.env`).
2. Install, migrate local D1, run:

   ```bash
   cd portal
   bun install
   bun run db:migrate:local
   bun run dev
   ```

   Combined Worker serves portal (`/`, `/login`, `/app/*`, …) and API (`/api/*`, `/docs`, `/embed.js`, …) on one origin.

   To refresh vendored CHS packages from a sibling checkout, see [`vendor/README.md`](./vendor/README.md).

3. Uncomment `API_KEYS` in `wrangler.jsonc` (and set `PROJECTION_ADMIN_SECRET` in `.dev.vars`) for key minting. Soft free API works with `API_KEYS` unbound.

## Migrations (D1)

```bash
bun run db:migrate:local    # local Miniflare D1
bun run db:migrate:remote   # production PORTAL_DB
bun run db:migrate:staging  # staging env
```

## Stripe webhook

Register `POST {BASE_URL}/api/stripe/webhook` in Stripe and set `STRIPE_WEBHOOK_SECRET` (Worker secret).
Checkout keeps `plan: free` until `checkout.session.completed` activates `metered`.

## Paid Checkout

`PAID_CHECKOUT_ENABLED=false` by default. Free tier (1 000 Billable units / month UTC) works without Stripe. Flip the flag only after the product addendum and licence checklist (see root `CONTEXT.md`).

## Founder admin

Users listed in `FOUNDER_USER_IDS` can toggle Enterprise `batchEnabled` on a Customer via the admin UI (projects to Worker KV).


## CHS UI kit

Shared buttons, inputs, labels, checkboxes, cards, badges and tables are vendored from
`@chester-hill-solutions/ui-kit` 0.5.0, upstream commit
`d1ee02287b8d58dd72dcf2ec9dd757ffb86f4960`. Component source lives in
`app/components/ui`; `.chs-ui.json` records the generator configuration. The app uses
React Aria for controls and Tailwind v4 through the Vite plugin. No private registry
credential or UI-kit runtime package is needed to build the checked-in components.

CanCoder theme values live in `app/styles/cancoder.css`: civic blue, cool surfaces,
Source Sans 3 body type and Source Serif 4 headings. `ui-theme.css` and `base.css`
remain upstream copies. Use semantic tokens and slot treatments in `cancoder.css`
for brand changes, rather than editing the generated components. `ActionLink` bridges
CHS button styles to React Router navigation; `SubmitButton` adds route submission
state to the CHS pending-state control. Internal navigation, documentation links,
and the homepage widget use root-relative URLs so both public hostnames stay on
the current origin.

With the UI-kit CLI available, run from `portal/`:

```sh
ui-kit add button input label card table native-select checkbox badge --overwrite
```

Review generated diffs before committing an upstream refresh. Keep the app-owned
CanCoder theme and router/form adapters.
