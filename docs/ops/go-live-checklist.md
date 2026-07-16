# Go-Live Checklist

Infrastructure and configuration steps required before production launch.
Sourced from the 2026-07 production-readiness audit. Updated 2026-07-16 (Workers + D1 all-in-one).

## Worker (Cloudflare) — API + portal

Config and deploy live under [`portal/`](../../portal/) (`wrangler.jsonc`, `npm run deploy` from repo root or `portal/`).

- [x] **R2 buckets**: `ridings` (prod) exists with all boundary datasets verified
      (`npm run upload:r2-datasets -- --verify-only --remote`). `ridings-staging` created;
      upload provincial GeoJSON (+ federal/ontario from prod copy) for staging parity.
- [x] **Staging bindings**: KV/D1 ids pasted; staging Worker at
      `https://riding-lookup-staging.chester-hill-solutions.workers.dev`. Copy prod secrets
      with `wrangler secret put … --env staging` before relying on geocode/admin.
- [x] **API_KEYS KV namespace**: created for prod (`2d0152b0958c48fab4a98b3046e0c08e`) and
      staging (`363048976bc74248b091f69510a1b759`). Bindings remain **commented** so soft
      free API stays open/unmetered. Uncomment both + redeploy before commercial/metered
      launch; then seed via `npm run keys`.
- [x] **Portal D1**: `cancoder-portal` (`PORTAL_DB`) and staging counterpart created and bound
      in `portal/wrangler.jsonc`. Apply migrations:
      `npm --prefix portal run db:migrate:remote` (prod) /
      `npm --prefix portal run db:migrate:staging`.
- [ ] **ODA D1 import**: prod ODA D1 is provisioned; staging D1 is empty until
      `npm run import:oda:all` (and suggest index) for staging. Build suggest index before
      flipping `ODA_SUGGEST_ENABLED`.
- [ ] **Worker secrets** (`cd portal && wrangler secret put …`):
  - [x] `GOOGLE_MAPS_KEY` — set in prod
  - [x] `BASIC_AUTH` — set in prod
  - [ ] `AUTH_SECRET` — Better Auth session signing
  - [ ] `BASE_URL` / `APP_PUBLIC_ORIGIN` — public portal origin (cookies / redirects)
  - [ ] `ALLOWED_ORIGINS` — required for restricted CORS with credentials
  - [ ] `PROJECTION_ADMIN_SECRET` — optional for external ops tools; portal uses in-process projection
  - [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_METERED`, `STRIPE_METER_EVENT_NAME`
  - [ ] `RESEND_API_KEY`, `EMAIL_FROM`
  - [ ] Staging: copy the same secrets with `wrangler secret put … --env staging`
  - `MAPBOX_TOKEN` — only if the Mapbox fallback is used
- [ ] **Routes / custom domain**: none configured yet; Worker is only at `*.workers.dev`
      until a route or custom domain is added. Portal and API share that origin.

## Stripe

- [ ] Create the `riding_lookup_api_call` meter and a metered Price.
- [ ] Set Stripe secrets on the Worker (above).
- [ ] Register the webhook endpoint at `/api/stripe/webhook` (same Worker origin).
- [ ] Only then flip `PAID_CHECKOUT_ENABLED`.

## Portal (same Worker)

- [x] **Package sourcing**: CHS auth packages vendored under
      `portal/vendor/@chester-hill-solutions/*` (`auth`, `auth-d1`, `auth-react-router`).
- [x] **Deploy target**: Cloudflare Workers via `portal/` Vite + Wrangler (not Railway).
- [x] **Portal lockfile**: `portal/package-lock.json` present; regenerate after vendor changes.

## CI follow-ups (code-side, tracked here for visibility)

- [x] Portal job in `.github/workflows/ci.yml` (install, typecheck, build).
- [x] Unified Worker dry-run after portal build.
- [x] **Geocode billing**: leave `/api/geocode`, `/api/reverse`, `/api/normalize-address`
      rate-limited but **unbilled** for soft launch. Revisit before paid meter goes live.
- [x] **Null-result billing**: a 200 lookup with `properties: null` **does** count as a
      Billable unit (matches CONTEXT.md).

## Code hardening completed 2026-07-16

- Portal owner/admin guards on keys, billing, and fuse settings
- Checkout keeps `plan: free` until Stripe `checkout.session.completed` webhook
- Monthly usage DO fail-closed when a hard fuse is enforced and the DO is down
- Portal auth on D1 (`auth-d1`); single Worker serves marketing + API
