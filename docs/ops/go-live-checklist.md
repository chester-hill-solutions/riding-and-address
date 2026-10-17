# Go-Live Checklist

Infrastructure and configuration steps required before production launch.
Sourced from the production-readiness audit. Updated 2026-10-16 after reconciling the public hosts and agent discovery baseline.

## Worker (Cloudflare) — API + portal

Config and deploy live under [`portal/`](../../portal/) (`wrangler.jsonc`; run `bun run deploy` from the repo root or `bun run deploy` from `portal/`).

- [x] **R2 buckets**: `ridings` (prod) exists with all boundary datasets verified
      (`npm run upload:r2-datasets -- --verify-only --remote`). `ridings-staging` created;
      upload provincial GeoJSON (+ federal/ontario from prod copy) for staging parity.
- [x] **Staging bindings**: KV/D1 ids pasted; staging Worker at
      `https://riding-lookup-staging.chester-hill-solutions.workers.dev`. Copy prod secrets
      with `wrangler secret put … --env staging` before relying on geocode/admin.
- [x] **API_KEYS KV namespace**: created and bound in production (`2d0152b0958c48fab4a98b3046e0c08e`);
      this enables Server API keys and customer billing. Staging namespace
      (`363048976bc74248b091f69510a1b759`) exists but its binding remains commented. Seed or
      administer keys with `bun run keys`.
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
  - [x] `AUTH_SECRET` — Better Auth session signing (present in prod and staging)
  - [x] `BASE_URL` — public portal origin; a plain var in `wrangler.jsonc`, set for both hosts
  - [ ] `APP_PUBLIC_ORIGIN` / `ALLOWED_ORIGINS` — required for restricted CORS with credentials
  - [ ] `PROJECTION_ADMIN_SECRET` — optional for external ops tools; portal uses in-process projection
  - [ ] `STRIPE_PRICE_METERED`, `STRIPE_METER_EVENT_NAME` — the metered price and event name
  - [x] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — present in prod and staging
  - [x] `RESEND_API_KEY` — present in prod and staging
  - [ ] `EMAIL_FROM` — sender identity
  - [x] `OFFER_SIGNING_SECRET` — signs `/api/quote` offers. Set in prod and staging on 2026-10-17:
        quoting is live and free (`GET /api/quote` returns a signed, expiring offer for a point
        lookup and for an area search). Acceptance still fails closed with `503
        PAYMENTS_UNAVAILABLE` while the rail is off, so nothing charges. Rotating it invalidates
        every outstanding offer and page cursor.
  - [ ] `X402_ENABLED`, `X402_PAY_TO`, `X402_NETWORK`, `X402_ASSET`, `X402_FACILITATOR_URL`
        (+ `X402_FACILITATOR_TOKEN`) — the x402 account-free rail. `/api/quote/accept` fails closed
        (`503 PAYMENTS_UNAVAILABLE`) until the rail is enabled and fully configured. Do not enable
        before the security review and the stablecoin treasury policy in ADR 0007
  - [ ] `X402_RPC_URL` — EVM JSON-RPC endpoint used by `POST /api/x402/reconcile` to confirm
        settlements on chain; that route fails closed (`503 RECONCILE_UNAVAILABLE`) without it
  - [ ] **`X402_SPEND` Durable Object binding** — the per-payer daily spend cap (security review
        item 4). Declared in `portal/wrangler.jsonc` with migration `v4`; required whenever the rail
        is enabled, because `reservePayerSpend` fails **closed** without it. Tune the cap with
        `X402_PAYER_DAILY_CAP_USD` (default `$25` per payer per UTC day; `0` disables the control).
  - [x] `PAID_RATE_LIMIT` — the paid rail's own throttle bucket (`100`/min in both environments),
        separate from `DEMO_RATE_LIMIT` so a paying caller on a shared egress IP is not throttled by
        unrelated demo traffic (security review item 7)
  - [x] **`X402_RECEIPTS` KV namespace** — created and bound for prod
        (`8dba512f75124b348cd6790a7f59b663`) and staging (`bf549c66a0dc435c9d86ba18cd7db82f`).
        Required whenever the rail is enabled: without it `/api/quote/accept` fails closed, because a
        settled payment would leave no reconciliation trace. Read `GET /api/x402/receipts` (admin) to
        reconcile
  - [ ] Staging: copy the same secrets with `wrangler secret put … --env staging`
  - `MAPBOX_TOKEN` — only if the Mapbox fallback is used
- **Secrets audit, 2026-10-17.** `cf workers secrets list` confirms the production script carries
  `AUTH_SECRET`, `BASIC_AUTH`, `GOOGLE_MAPS_KEY`, `INBOX_TOKEN`, `OFFER_SIGNING_SECRET`,
  `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; staging carries a subset. Entries
  above are marked from that list, so **presence is confirmed, values are not** — an unchecked entry
  may be unverified rather than absent.
- **Setting a secret needs the latest version deployed.** The secrets API refuses with error `10215`
  while a newer version exists that has not been deployed, which is the normal state for a minute or
  two after a Workers Build. Wait for the deployment to land (or deploy the version first).
- [x] **Production hosts**: the combined Worker serves the custom domain
      `https://cancoder.chesterhillsolutions.ca` and the `workers.dev` host
      `https://riding-lookup.chester-hill-solutions.workers.dev`. The host-aware public resource
      list is in `PUBLIC_API_HOSTS`; portal and API share the deployment.
- [x] **Agent discovery baseline**: MCP at `/mcp`, agent setup at `/docs/agents.md`, plus
      `robots.txt`, sitemap, API linkset, and AI catalog are routed by the combined Worker.
      These resources describe lookup capability, the two quote tools (live and free), and the area
      search, which is quoted but not purchasable while the rail is off. The machine-readable terms
      still carry no price for the paid rail.

## Zone TLS posture (applied 2026-10-17)

The custom domain sits in a zone shared with other projects, so these were applied as a deliberate
pass and verified hostname by hostname. All three are now in place.

- [x] **`always_use_https` = `on`.** Plain HTTP is redirected at the edge for every hostname in the
      zone, before any Worker runs. Verified: `http://` → `301` on `chesterhillsolutions.ca`,
      `cancoder.chesterhillsolutions.ca`, and `stow.chesterhillsolutions.ca`.
- [x] **`ssl` = `full`.** Cloudflare now connects to origins over HTTPS. `full` rather than
      `strict`: `strict` requires a valid, publicly trusted certificate at *every* origin in the
      zone, and the origin-backed hostnames (Cloudflare Tunnel, Pages, a wildcard) have not been
      verified individually. `full` encrypts without cert validation, so it cannot introduce `526`s.
      **Raising it to `strict` is a follow-up once each origin's certificate is confirmed.**
- [x] **`min_tls_version` = `1.2`.** Verified: TLS 1.1 is refused, TLS 1.2 and 1.3 succeed.

Verified after the change, with no regressions: `chesterhillsolutions.ca` / `www` (Pages) `301`,
`ssh` (Cloudflare Tunnel) `200`, `cancoder` / `dedupe` / `stow` (Workers) `200`.

Two hostnames were **already failing before** this change and were not caused by it — worth a
separate look:

- `oc.chesterhillsolutions.ca` → `502` (tunnel not answering).
- `*.chesterhillsolutions.ca` (wildcard → a parking service) → `530` (origin DNS error).

The Worker-side redirect in `src/force-https.ts` is still in place. With `always_use_https` on it no
longer fires for the custom domain — the edge answers first — but it remains the only cover for the
`workers.dev` hostname, which no zone setting reaches.

## Stripe

- [ ] Create the `riding_lookup_api_call` meter and a metered Price.
- [ ] Set Stripe secrets on the Worker (above).
- [ ] Register the webhook endpoint at `/api/stripe/webhook` (same Worker origin).
- [ ] Only then flip `PAID_CHECKOUT_ENABLED` (currently `false` in production config).

## Portal (same Worker)

- [x] **Package sourcing**: CHS auth packages vendored under
      `portal/vendor/@chester-hill-solutions/*` (`auth`, `auth-d1`, `auth-react-router`).
- [x] **Deploy target**: Cloudflare Workers via `portal/` Vite + Wrangler (not Railway).
- [x] **Portal lockfile**: `portal/bun.lock` present; regenerate after vendor changes.

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
