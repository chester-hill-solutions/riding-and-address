# Go-Live Checklist

Infrastructure and configuration steps required before production launch.
Sourced from the 2026-07 production-readiness audit. Updated 2026-07-16.

## Worker (Cloudflare)

- [x] **R2 buckets**: `ridings` (prod) exists with all boundary datasets verified
      (`npm run upload:r2-datasets -- --verify-only --remote`). `ridings-staging` created;
      upload provincial GeoJSON (+ federal/ontario from prod copy) for staging parity.
- [x] **Staging bindings**: KV/D1 ids pasted; staging Worker deployed at
      `https://riding-lookup-staging.chester-hill-solutions.workers.dev`. Copy prod secrets
      with `wrangler secret put … --env staging` before relying on geocode/admin.
- [x] **API_KEYS KV namespace**: created for prod (`2d0152b0958c48fab4a98b3046e0c08e`) and
      staging (`363048976bc74248b091f69510a1b759`). Bindings remain **commented** so soft
      free API stays open/unmetered. Uncomment both + redeploy before commercial/metered
      launch; then seed via `npm run keys`.
- [ ] **D1 + ODA import**: prod D1 is provisioned; staging D1 is empty until
      `npm run import:oda:all` (and suggest index) for staging. Build suggest index before
      flipping `ODA_SUGGEST_ENABLED`.
- [ ] **Worker secrets** (`wrangler secret put …`):
  - [x] `GOOGLE_MAPS_KEY` — set in prod
  - [x] `BASIC_AUTH` — set in prod
  - [ ] `ALLOWED_ORIGINS` — required for restricted CORS with credentials
  - [ ] `PROJECTION_ADMIN_SECRET` — must equal the portal's `WORKER_PROJECTION_SECRET`
  - [ ] `STRIPE_SECRET_KEY`, `STRIPE_METER_EVENT_NAME` — when paid checkout goes live
  - [ ] Staging: copy the same secrets with `wrangler secret put … --env staging`
  - `MAPBOX_TOKEN` — only if the Mapbox fallback is used
- [ ] **Routes / custom domain**: `wrangler.jsonc` has none configured; the Worker is only
      reachable at `*.workers.dev` until a route or custom domain is added.

## Stripe

- [ ] Create the `riding_lookup_api_call` meter and a metered Price.
- [ ] Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_METERED` (portal env).
- [ ] Register the webhook endpoint at `/api/stripe/webhook` (portal).
- [ ] Only then flip `PAID_CHECKOUT_ENABLED`.

## Portal

- [x] **Package sourcing**: CHS auth packages vendored under
      `portal/vendor/@chester-hill-solutions/*` (see `portal/vendor/README.md`). Prefer
      GitHub Packages publish later when `write:packages` is available, then switch to
      semver and drop the vendor tree.
- [ ] **Postgres**: provision (Railway) and run `npm run db:migrate` in `portal/` against
      the production `DATABASE_URL`.
- [ ] **Deploy target**: stand up the Railway service (build: `npm run build`, start:
      `npm run start`), set env vars (`DATABASE_URL`, auth secret, `BASE_URL`,
      `WORKER_PROJECTION_URL` + secret, email + Stripe config), and add a public domain.
- [x] **Portal lockfile**: `portal/package-lock.json` present; regenerate after vendor
      path change (`npm install` in `portal/`).

## CI follow-ups (code-side, tracked here for visibility)

- [x] Add a portal job to `.github/workflows/ci.yml` (install, typecheck, build).
- [x] **Geocode billing**: leave `/api/geocode`, `/api/reverse`, `/api/normalize-address`
      rate-limited but **unbilled** for soft launch (upstream Google cost accepted under
      demo/rate limits). Revisit before paid meter goes live.
- [x] **Null-result billing**: a 200 lookup with `properties: null` **does** count as a
      Billable unit (matches CONTEXT.md). Document in customer-facing pricing if needed.

## Code hardening completed 2026-07-16

- Portal owner/admin guards on keys, billing, and fuse settings
- Checkout keeps `plan: free` until Stripe `checkout.session.completed` webhook
- Monthly usage DO fail-closed when a hard fuse is enforced and the DO is down
