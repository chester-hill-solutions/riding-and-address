# Code Health Remediation Plan — riding-and-address

Source: code evaluation 2026-10-19 (repository review; `bun run validate` green at 1,354 tests).
Goal: close the four High-severity gaps and the Medium ones found in that review, in an order that
keeps `main` shippable and the Worker deployed at every step.

This plan **builds on** `docs/plans/architecture-deepening-plan.md` rather than replacing it. Wave
status of that plan, as re-derived from the tree on 2026-10-19:

| Deepening-plan wave | State | Evidence |
|---|---|---|
| Wave 0 — queue client | **done** | `src/queue-client.ts` exists; no `idFromName('main-queue')` outside it |
| Wave 1 — riding lookup core | not started | no `src/riding-lookup-core.ts` |
| Wave 2 — geocoder provider seam | **done** | `src/geocoder-providers.ts` exists |
| Wave 3 — response policy | **done, one straggler** | one wildcard CORS literal left, in `src/embed-docs.ts` |
| Wave 4 — storage seams | **done** | `src/usage-ledger.ts` (port + 3 adapters), `src/dataset-source.ts` |

---

## Ground rules (every wave)

- **CI green + deployed** at the end of each wave. `bun audit --audit-level=high` stays clean.
- **ADR guardrails** — ADR-0002 (never fail-closed on Stripe for lookups), ADR-0004 (no dual-serve
  window; dataset pin hard-fails), ADR-0005 (`httpStatusForKeyDenial` stays the sole status map;
  allowance/fuse literals stay allowlisted). Nothing here reopens them.
- **A gate is a ratchet, not a cliff.** A new gate fails only on *regression* against a committed
  baseline, so it cannot fail the build on day one and teach the team to ignore it. This is the
  pattern in `docs/reviews/2026-07-16-strictness-ratchet.md`; the same rule applies to structure.
- **Live verification, not just a green CI run.** A finding is not a finding until it is re-derived
  from the current tree, and a fix is not a fix until the live surface shows it. The MCP tool
  description and the consent page's refusal copy are the convenient markers.
- **The billing-invariants gate keeps its rules.** Nothing here moves a constant out of
  `scripts/check-billing-invariants.mjs` or widens an allowlist.
- **Vocabulary** from `CONTEXT.md` holds: Customer, User, Server key, Browser key, Billable unit,
  Fuse, Enterprise, Dataset pin, ODA, NAR.

---

## Dependency shape

```
Wave 0 (session liveness) ──────────────► independent
Wave 1 (coverage ratchet) ──────────────► independent;  Wave 4 depends on it
Wave 2 (portal suite)     ──────────────► independent
Wave 3 (import cycles)    ──────────────► independent;  Wave 4 ports against its layering
Wave 5 (hygiene)          ──────────────► independent

Wave 1  ──► Wave 4     (the ratchet makes a ported handler land with its tests)
Wave 3  ──► Wave 4     (ports must not deepen the cycles Wave 3 closes)
```

Waves 0, 1, 2, 3 and 5 are mutually independent and may run in parallel across people.

---

## A correction to the review that produced this plan

The review reported **four** cyclic import groups. That count included **type-only** imports,
which are erased at compile time and create no runtime edge. Recomputed over value imports and
value re-exports only, there are **two** runtime cycles:

| Cycle | Members |
|---|---|
| 1 | `cache.ts`, `dataset-source.ts`, `datasets.ts`, `oda-normalize.ts`, `spatial.ts`, `utils.ts` |
| 2 | `api-key-usage-do.ts`, `lookup-expansion.ts`, `oda-handlers.ts`, `upload-jobs.ts` |

`route-context.ts` is in **neither**. The claim in `src/routes.ts`'s own header — that it is "the
leaf `route-context.ts`" and that this keeps the module "free of the old cycle" — is **true at
runtime**. The review overstated this, and Wave 3 below is scoped to the two real cycles.

---

## Wave 0 — Session liveness for access tokens  *(High · behaviour change · medium risk)*

### The problem

`src/oauth-token.ts:125` `verifyOAuthAccessToken()` verifies the signature, the issuer, the
audience, the expiry and a non-empty `customer_id`. It never consults a session. Grep for
`sid|revoke|revocation|session` across `src/oauth-token.ts` and `src/worker.ts` returns **zero
matches**.

The consequence: an access token keeps working after the user signs out, after the session expires,
and after the session is deleted. The token's own lifetime is 3,600 s
(`portal/app/lib/oauth-lifetime.ts`), so the exposure window is bounded — but the consent screen
tells a person their grant lasts a bounded time and does not say that a sign-out does not end it.

Two mechanisms are already in the schema and neither is consulted:

- `portal/migrations/0002_oauth.sql:135` — `oauthAccessToken.revoked integer`. Never read.
- `portal/migrations/0002_oauth.sql:126` — `oauthAccessToken.session_id TEXT REFERENCES session(id)
  ON DELETE SET NULL`. The `ON DELETE SET NULL` means the schema **already anticipates** a session
  going away and the access token noticing. Nothing reads it.

This is the "decision, not a bug to fix blindly" the handoff names. This wave is the decision,
written down and implemented.

### The decision

**An access token is valid while (a) its own expiry holds, (b) the session it was minted for still
exists and has not expired, and (c) it has not been explicitly revoked.**

Both (b) and (c) are checks the schema already supports. (b) covers sign-out; (c) covers a person
revoking a grant.

### The shape

1. **Carry the session id in the token.** Add `sid` to the access token claims in
   `portal/app/lib/auth.server.ts:67` `customAccessTokenClaims`, beside the existing
   `customer_id`.
   - **Verify first**: confirm the provider's `customAccessTokenClaims` callback receives the
     session (today it destructures `{ user }` only). If it does not, the fallback is to read the
     session id from the `oauthAccessToken` row at issuance and add it to the claim explicitly.
2. **Consult it in the resource server.** In `src/oauth-token.ts`, after `jwtVerify` succeeds, look
   the session up in `PORTAL_DB` — the same Worker already reads the `jwks` table from there for
   the signing key, and `src/oauth-token.ts:64-69` already documents that as a deliberate, narrow
   exception.
   - `SELECT expires_at FROM session WHERE id = ?` for liveness.
   - `SELECT revoked FROM oauthAccessToken WHERE ...` for the revocation flag — keyed on the
     access token's own id, carried in the claim alongside `sid`.
3. **Cache the verdict, briefly.** A per-isolate cache keyed by `sid`, TTL 10–30 s. This bounds
   revocation latency to the TTL and amortises the read to roughly one query per session per TTL.
4. **Fail closed, with a bounded grace window.** If the DB errors, allow the request for up to
   `SESSION_CHECK_GRACE_MS` (default 60 s) past the last known-live verdict for that `sid`; after
   that, refuse. Revocation latency stays bounded by TTL + grace, and a D1 blip does not take
   OAuth auth down for every caller.
   - **This is the decision the review asks for.** The alternative — fail open — trades revocation
     certainty for availability. The recommendation is fail-closed-with-grace, and it is recorded
     as an ADR rather than left implicit.
5. **Kill switch.** `OAUTH_SESSION_CHECK` — `off` disables the check entirely, so a bad deploy can
   be reversed without a redeploy. Follow the `isOdaSuggestEnabled` pattern in `src/oda-config.ts`.
6. **Refusal shape — uniform.** RFC 6750 `invalid_token`: 401 with
   `WWW-Authenticate: Bearer error="invalid_token"`. Do **not** distinguish "session ended" from
   "bad signature" to the caller; that would make the endpoint an oracle for probing tokens. The
   repo already states this principle at `src/oauth-token.ts:161-164`. Log the real reason.
7. **Tokens minted before the change keep working.** If `sid` is absent from the claim, the session
   check is skipped. This is required: tokens are already issued, and failing them would break
   live clients for no security gain (their own expiry still bounds them).
8. **Fix the consent copy.** `portal/app/lib/consent-copy.ts` currently states the lifetime. It
   must now say the grant ends when the token expires **or the person signs out**. The screen
   making a promise the resource server cannot keep is the exact defect #214 was filed for.

### Tests

`test/oauth-token.test.ts` (new file — none exists today):

- a valid token with a live session → `ok`;
- a token whose session row is gone → `invalid`;
- a token whose session is expired → `invalid`;
- a token with no `sid` claim → `ok` (backward compatibility);
- a token whose `oauthAccessToken.revoked` is set → `invalid`;
- a DB error → refused once the grace window has elapsed, allowed before it;
- `OAUTH_SESSION_CHECK=off` → the check is skipped entirely;
- the caller cannot distinguish the two refusal reasons from the response body.

**Live:** on staging, mint a token through the real portal, sign out, and confirm the next call is
refused with `invalid_token` — and that a token with the demo allowance still works.

### Done when

- `src/oauth-token.ts` consults the session and the revocation flag.
- A signed-out user's token is refused on staging, verified live.
- ADR-0011 written: *Session liveness for OAuth access tokens*.
- `portal/app/lib/consent-copy.ts` states the new rule, and a test asserts it.

### Risk

**Medium** — this is an auth change on a live paid path. Mitigations: the kill switch; the grace
window; the `sid`-absent case keeps existing tokens working; ship with the flag **on in staging,
off in production** for one deploy, then flip after staging is clean.

---

## Wave 1 — Coverage on the money path, and the ratchet  *(High · no behaviour change · low risk)*

### The problem

Coverage follows new work and thins out on old, load-bearing code:

| Module | Stmts | Branch | What it owns |
|---|---|---|---|
| `src/projection-handlers.ts` | 13.5% | 9.3% | mints and deletes API keys; mutates customer fuse/plan |
| `src/ops-handlers.ts` | 20.0% | 20.0% | `/metrics`, `/health`, `/cache-warming`, breaker reset |
| `src/circuit-breaker.ts` | 42.4% | 38.4% | the geocoding/R2 breakers |
| `src/circuit-breaker-do.ts` | **0%** | 0% | the Durable Object |
| `src/webhooks.ts` | 46.0% | 26.0% | delivery, retry, secret masking |
| `src/batch.ts` | 55.1% | 48.4% | the Enterprise batch path |
| `src/queue-manager.ts` | 56.0% | 41.0% | the queue DO |
| `src/spatial.ts` | 64.9% | 50.3% | the spatial index |
| `src/billing.ts` | 70.0% | 64.4% | the fuse and Stripe metering |
| `src/customer.ts` | 70.4% | **45.0%** | allowance and fuse resolution |

Contrast with the newly built surfaces, which are near-complete: `area-request` 100%,
`mcp-purchase` 100%, `return-selector` 100%, `oda-normalize` 98.4%, `cimd-fetch` 98.7%,
`lookup-handler` 97.8%.

`src/projection-handlers.ts` is the sharpest case: it holds `mintKeyProjectionCore` and
`revokeKeyProjectionCore` — the functions that mint and destroy credentials — at 12% line coverage,
with no test exercising either.

### Step 1 — Test infrastructure (prerequisite for this wave and for Wave 2)

1. **Extract the memory KV.** `createMemoryKv` is private to `test/helpers/lookup-test-env.ts:115`
   and duplicated in five other files (`test/area-accept.test.ts:42`, `test/area-page-ceiling.test.ts:45`,
   `test/area-polygon.test.ts:66`, `test/cache-validation.test.ts:12`, `test/geocoding.test.ts:31,539,590,990`).
   Move it to `test/helpers/memory-kv.ts` and export it. One fake, one home.
2. **Add `createProjectionTestEnv()`** beside it: binds `API_KEYS` to a memory KV, `API_KEY_USAGE`
   to `test/helpers/fake-usage-do.ts`, and sets `FREE_MONTHLY_ALLOWANCE`.
3. **Share it with the portal.** `portal/app/lib/cimd-fetch.ts` already imports `../../../src/cimd-fetch`,
   so a root helper at `test/helpers/` is reachable from `portal/test/` as `../../test/helpers/…`.
   One fake for both packages — no second implementation to drift.

### Step 2 — The tests

| New / extended file | Covers | Target |
|---|---|---|
| `test/projection-handlers.test.ts` | mint browser key (the id **is** the secret; origins stored; `dailyLimit` defaults to 1000); mint server key (secret returned once; stored as a SHA-256 hash; the raw secret never reaches KV); revoke (key gone, hash entry gone, caches invalidated); upsert customer (plan narrowed to `CustomerPlan`; `fuseLimit` defaults via `defaultFuseLimit`); delete customer; usage projection; the HTTP wrapper's routing (404 / 400 / method paths); `checkProjectionAuth` (unset secret → refuse, wrong token → refuse, correct → pass) | `projection-handlers.ts` ≥ 85% stmts |
| `test/billing-fuse.test.ts` | hard block at the limit; soft-warn continues past it; unlimited (`fuseLimit` 0) always allowed; the exact denial body; `recordSuccessfulBillable` with `waitUntil` versus awaited; the Stripe meter path | `billing.ts` ≥ 90% stmts, ≥ 85% branch |
| `test/customer-fuse.test.ts` | `defaultFuseLimit`: enterprise → 0; `FREE_MONTHLY_ALLOWANCE` override; non-numeric env → default; `0` or negative env → default; `loadCustomer` rejects a malformed record (the zod shape check) | `customer.ts` ≥ 90% stmts, ≥ 80% branch |
| `test/webhooks.test.ts` | delivery, retry, secret masking (v1 omits `secret`; v2 masks it) | `webhooks.ts` ≥ 80% |
| `test/circuit-breaker-do.test.ts` | the DO's storage logic — currently **0%** | ≥ 80% |
| extend `test/circuit-breaker.test.ts`, `test/queue-manager.test.ts`, `test/ops-handlers.test.ts` | the uncovered branches | ≥ 80% each |

### Step 3 — Close an item this repo already filed against itself

`docs/reviews/2026-07-16-strictness-ratchet.md:28` lists, still open:

> Medium | Projection bodies unvalidated (`request.json()` cast) | Zod schemas on projection PUT/POST

`src/projection-handlers.ts:141` and `:157` cast `request.json()` to a type with no validation. Add
zod schemas, following `src/validation.ts` and `src/api-keys.ts`. The repo already has zod; this is
a consistency fix, and it is on the credential-issuing path.

### Step 4 — The ratchet gate

**Design decision: a ratchet, not an absolute floor.** An absolute threshold fails the build on day
one and teaches the team to ignore it. A ratchet fails only on *regression*, which is the property
that matters, and it is the pattern this repo already uses.

1. Add `@vitest/coverage-v8` as a devDependency. It is **not** installed today — `vitest --coverage`
   currently fails with `Cannot find dependency '@vitest/coverage-v8'`.
2. Commit `test/coverage-baseline.json`: per-file statement and branch floors, seeded from the run
   *after* Step 2.
3. Add `scripts/check-coverage-ratchet.mjs`: run coverage, compare against the baseline, fail if any
   file regressed. The baseline moves only via an explicit `--update` flag, and the diff in that PR
   is the review surface.
4. Wire it into `bun run validate` and CI, beside `check:billing-invariants`.

### Done when

- `src/projection-handlers.ts` ≥ 85% statements, `src/billing.ts` ≥ 90%, `src/customer.ts` ≥ 90%.
- `scripts/check-coverage-ratchet.mjs` fails when a floor is lowered, and is in CI.
- Projection bodies are schema-validated.

### Risk

**Low.** Tests and a gate; no production behaviour changes. The exception is the projection zod
schemas, which turn an invalid body from a 500 into a 400 on the external-ops path — a fix, not a
regression.

---

## Wave 2 — The portal suite  *(High · no production change · medium effort)*

### The problem

`portal/app` + `portal/workers` are 4,200 LOC across 60 files, with **8 tests in 3 files**. The
portal owns signup, session handling, the Stripe checkout (the upload checkout is the one **enabled
in production**: `UPLOAD_CHECKOUT_ENABLED=true`), API-key ownership, the consent screen, and the
authorization-server wiring in `portal/app/lib/auth.server.ts`.

The last three portal commits were fixes to a screen with near-zero test coverage:

| PR | Defect |
|---|---|
| #214 | the consent screen promised a revoke control that did not exist |
| #216 | the consent action forwarded no `Origin` → **a consent could never complete** |
| #217 | the consent loader required a `code` a consent link never carries → **the screen was unusable** |

None of them was caught by a test. All three were caught by driving the surface.

### Step 1 — Make the portal testable

The blockers are a database, a Cloudflare request context, and a session.

1. **D1 — reuse the repo's own idea.** `test/helpers/oda-sqlite.ts` runs the **real** D1 SQL
   against Node's `node:sqlite`, and the CI comment says so: *"The ODA test harness runs the real D1
   SQL against node:sqlite, which is reliable from Node 24."* Apply `portal/migrations/0001_init.sql`
   and `0002_oauth.sql` to an in-memory `node:sqlite` and expose it as a `D1Database` shim.
   `createD1Shim` is the template.
   - This is the high-value move: the portal tests then exercise the **actual schema** — including
     the foreign keys and the `oauthAccessToken.session_id ON DELETE SET NULL` that Wave 0 depends
     on.
2. **Cloudflare context** — provide a test context for `portal/app/lib/cloudflare-context.server.ts`.
3. **Auth** — `getAuth()` builds a Better Auth instance per request against `getDb()`. With a real
   D1 shim underneath, it can run as-is.

### Step 2 — Test the routes, in the order the bug history demands

| Route | What to assert | Why |
|---|---|---|
| `consent.tsx` loader | a signed query with a valid signature renders the client name and the scopes; a tampered `client_id` or a widened `scope` is **refused**; a query with **no `code`** is accepted | #217 |
| `consent.tsx` action | forwards `Origin` and `Referer`; `accept=false` answers 302 with `error=access_denied` and the client's `state` | #216 |
| `api.stripe-webhook.ts` | a valid signature activates `metered`; an invalid signature does not; a replay is idempotent | the money path; the upload checkout is live |
| `app.keys.tsx` | a non-owner cannot mint a Server key; a revoked key stops working | the ratchet review's "cross-workspace key revoke" line |
| `signup.tsx` | the daily bucket refuses the sixth attempt from one address | the bucket exists; the route does not |
| `app.upload.tsx` | the sheet is priced from `portal/app/lib/pricing.ts`, never a literal | ADR-0005's rule, on the portal side |
| `portal/app/lib/consent-copy.ts` | states the Wave 0 rule (lifetime **or** sign-out) | Wave 0 |

### Step 3 — Extend the ratchet to the portal

The same `scripts/check-coverage-ratchet.mjs`, with a second baseline for `portal/app`. Note that
`portal/vitest.config.ts` sets no `testTimeout`; the D1 shim may need one.

### Done when

- `portal/test/` has ≥ 6 files and ≥ 40 tests.
- The consent loader and action are covered by the eight cases the handoff describes.
- The Stripe webhook is covered for signature, activation and replay.
- The portal coverage baseline is committed and ratcheted.

### Risk

**Medium effort, zero deploy risk.** Nothing in production changes — this is test infrastructure
only. The risk is time and the fidelity of the D1 shim.

---

## Wave 3 — Break the two runtime cycles  *(High · structural · medium risk)*

### Why this matters beyond tidiness

Cycle 2 is the plausible mechanism behind a bug this repo was already bitten by. Issue #205: an
OAuth token resolved a Customer but carried no key record, so `src/mcp.ts` built a null billing
context and `recordSuccessfulBillable` never ran — **a live billing bypass**. The same class of
defect arrives through a cyclic dependency where a module's import quietly decides behaviour.

### Cycle 1 — the datasets/cache group

```
cache.ts          → datasets.ts, oda-normalize.ts
dataset-source.ts → cache.ts, spatial.ts, utils.ts
datasets.ts       → dataset-source.ts
oda-normalize.ts  → utils.ts
spatial.ts        → utils.ts
utils.ts          → datasets.ts          ← the re-export
```

Three moves, in order of independence:

1. **Delete the dead backward-compat re-export.** `src/utils.ts:7-20` re-exports the dataset
   registry "for backward compatibility". **Every real consumer already imports from `./datasets`
   directly** — all ten of them: `src/routes.ts:29`, `src/cache.ts:5`, `src/riding-lookup.ts:6`,
   `src/service-terms.ts:24`, `src/agent-discovery.ts:12`, `src/docs.ts:4`, `src/lookup-expansion.ts:15`,
   `test/docs.test.ts:6`, `test/service-terms.test.ts:5`. **Zero** importers use the `utils` path.
   The re-export exists only to create this cycle edge. Deleting it removes `utils → datasets` at
   zero risk, and it is the single highest-leverage line in this wave.
2. **Move the geometry primitives out of `utils.ts`.** `isPointInPolygon`, `polygonContains`,
   `ringContains`, `simplifyGeometry`, `simplifyLineString`, `pointToLineDistance` — `src/utils.ts:107-207`
   and `:799-909` — become `src/geometry.ts`. This removes `spatial.ts → utils.ts`
   (`src/spatial.ts:2`, its only import) and `spatial.ts → dataset-source.ts` is already type-only.
3. **Move the input validation out of `utils.ts`, and the dataset LRU out of `cache.ts`.**
   - `validatePostalCode`, `sanitizeString`, `validateCoordinates` → `src/input-validation.ts`.
     This removes `oda-normalize.ts → utils.ts`.
   - `withRetry` + `NonRetriableError` → `src/retry.ts`. This removes `dataset-source.ts → utils.ts`.
   - `CACHE_CONFIG`, `LRUCache`, `geoCacheLRU`, `spatialIndexCacheLRU` → `src/dataset-cache.ts`.
     These are parsed-GeoJSON caches — a dataset-loading concern — and `cache.ts` is the geocoding
     cache plus a warming orchestrator. The deepening plan already says this: *"split `cache.ts` —
     the warming orchestrator … is a scheduler job wearing a cache name; rename/move it out."*
     This removes `dataset-source.ts → cache.ts`, and with it `cache.ts → datasets.ts →
     dataset-source.ts → cache.ts`.

`src/utils.ts` lands near 570 lines (918 today, less roughly 345 moved out), holding rate limiting,
the error dialect, the auth helpers and the correlation ids — which is what it is actually for.

### Cycle 2 — the lookup/upload group

```
api-key-usage-do.ts → upload-jobs.ts
upload-jobs.ts      → lookup-expansion.ts, riding-lookup.ts
lookup-expansion.ts → oda-handlers.ts
oda-handlers.ts     → api-key-usage-do.ts
```

Three moves:

1. **Extract `consumeDailyQuota`** — `src/api-key-usage-do.ts:279`, consumed at
   `src/oda-handlers.ts:13,192` — into a leaf `src/daily-quota.ts` that imports nothing from
   `upload-jobs.ts`. Both sides then depend on the leaf.
2. **Extract `resolveNormalizedAddress`** out of the handler module `src/oda-handlers.ts` into a
   leaf `src/oda-resolve.ts`. **A handler module should not be a library another module imports a
   pure function from** — that edge is what closes this loop. This is also the highest-leverage
   single move in the wave.
3. **Inject the lookup function into `UploadJobs`.** `src/upload-jobs.ts:5-6` imports
   `performExpandedLookup` and `cachedLookupRiding`; `src/upload-jobs.ts:15` is
   `constructor(private state: DurableObjectState, private env: Env)`. Take the lookup function as
   a constructor dependency instead. After (1) and (2), `upload-jobs.ts` no longer reaches
   `oda-handlers.ts`; with (3) it no longer reaches `lookup-expansion.ts`. The loop is open.

### The gate

Structural, so it belongs beside the coverage ratchet:

- `scripts/check-import-cycles.mjs` computes the runtime SCCs (value imports and value re-exports
  only — **type-only imports are erased and must not count**) and fails if the count of cyclic SCCs
  exceeds `test/import-cycle-baseline.json`, seeded at 2 and ratcheted to 0 as the cycles close.
- This is the strictness-ratchet pattern applied to structure. Without it a new cycle lands
  unnoticed — which is how the #205 class of defect arrives.

### Done when

- The runtime SCC count is **0**.
- `scripts/check-import-cycles.mjs` fails if a cycle is introduced, and is in CI.
- `src/utils.ts` holds no dataset-registry re-export.

### Risk

**Medium.** These are structural moves in the lookup path. Mitigation: every move is a file-move
plus an import-line change, with **no logic edit**; the 1,354 existing tests plus
`test/lookup-api.integration.test.ts` cover the lookup path; and Wave 1's ratchet means a coverage
regression shows up in the same PR.

---

## Wave 4 — Finish or decide the strangler  *(Medium · mechanical · medium-high effort)*

### The problem

32 of 53 route entries still carry `handler: legacy` and dispatch to `legacyFetch()` — a ~363-line
if-chain in `src/worker.ts`, described in `src/routes.ts`'s own header as a temporary "strangler
fallback". Two coexisting dispatch paths serve one product surface.

**Mitigation already in place:** the auth and rate-limit prelude (`runPrelude`) runs for legacy
entries too, so the security posture is unified. The residual cost is the duplicated dispatch and
the duplicated table policy — for example `/api/database/*` is declared `auth: 'public'` while its
admin children are `auth: 'admin'`, and `/api/queue/*` is `auth: 'key'` while the specific queue
routes above it are `auth: 'admin'`. Those splits need an explicit decision rather than a legacy
accident.

### Recommendation

**Finish it.** The table calls `legacy` temporary; a fallback that has run for months is a second
architecture. Finish it in path families, one PR each, each green and deployed before the next.

Order by exposure, not by size:

1. **`/api/search`** — the autocomplete path; `auth: 'search'` is the browser-key dialect, and
   `isOdaSuggestEnabled` makes its behaviour conditional, so it is the least-tested dialect in the
   table.
2. **`/api/geocode`, `/api/reverse`, `/api/normalize-address`** — the three the billing-invariants
   gate specifically requires to be **unbilled**. Their handlers must land where that rule can see
   them, so move the rule with them or re-point it.
3. **`/batch` and `/batch/:id`** — the Enterprise path. The batch fuse-redaction loop lives in the
   legacy branch today (`src/worker.ts:359-383`); move it with the handler.
4. **`/api/database/*` and `/api/boundaries/*`** — admin surfaces, and the place the `public` vs
   `admin` split above must be decided.
5. **The queue routes** — admin-gated, lowest traffic, last.

### Per-entry done when

- The entry carries a real handler.
- The old branch is **deleted** — the table's own rule: *"ported entries carry a real handler and
  their old branch is deleted."*
- The handler has tests. Wave 1's ratchet makes this automatic.
- `legacyFetch` shrinks by the entry's worth of lines.

### Done when

`grep -c "handler: legacy" src/routes.ts` returns **0**, and `legacyFetch` is deleted from
`src/worker.ts`.

### Risk

**Medium-high** — 32 entries, each a behaviour-preserving move. Mitigation: one path family per PR,
each PR green and deployed, each reviewed against the pre-move behaviour with the integration tests
as the witness. Do not batch.

---

## Wave 5 — Credential and document hygiene  *(Medium · low risk)*

### 5.1 — Rotate the committed demo browser key

`portal/wrangler.jsonc:157` commits `pk_live_5269b90b8a5b6c9c3ae5645a593e1029b60fcfbe396f1019`,
bound to the **production** `API_KEYS` KV namespace (`2d0152b0958c48fab4a98b3046e0c08e`; staging
uses a different id). Introduced in `789b31e` and never removed.

Both the wrangler comment and `src/api-keys.ts:6-8` state that browser keys are **public
identifiers by design** — origin-allowlisted with a daily cap. So this is **not** a secret leak and
the blast radius is bounded. It is still worth fixing, because a live production-bound credential
is permanently public in git history and **cannot be rotated out of history**; rotation is the only
remedy.

1. Mint a replacement (`bun run keys`).
2. Put it in `wrangler secret` / the environment rather than `vars`; update `portal/.env.example`
   to reference it instead of carrying a literal.
3. Remove the literal from `portal/wrangler.jsonc`.
4. The old literal stays in history — the mitigation is that the old key is dead.

**Add a secret-scan gate.** A script that fails when a `pk_live_` / `sk_live_` / `sk_test_` literal
appears in a tracked file outside an allowlist. The allowlist covers `portal/.env.example`, which
legitimately carries `sk_test_…` and `whsec_…` placeholders.

### 5.2 — ADR status drift

`docs/adr/0010-mcp-client-registration-cimd.md` reads **"Status: accepted, implementation pending"**
although #207 is merged and `src/cimd-fetch.ts` implements it, with 16 tests covering every case
the ADR itself names. The repo's own rule — *"A finding is not a finding until it is re-derived from
the current tree"* — is applied to findings and not to decision records.

1. Update ADR-0010's status to "accepted, implemented (#207)".
2. Add one line to the ADR convention: *a status must be re-derived from the tree before a release.*

### 5.3 — The last wildcard CORS literal

`grep "'Access-Control-Allow-Origin': '\*'" src/` returns exactly one hit: `src/embed-docs.ts:17`. It
is the last straggler of the deepening plan's Wave 3 CORS sweep. Route it through
`src/http-headers.ts` like the other 53 entries.

### Done when

- No `pk_live_` literal in any tracked file; the secret-scan gate is in CI.
- ADR-0010's status is true.
- `grep "'Access-Control-Allow-Origin': '\*'" src/` returns 0 outside `src/http-headers.ts`.

### Risk

**Low**, except the key rotation needs a coordinated deploy: mint → put the new key in the secret →
confirm the embed widget works in the browser → remove the literal → redeploy. The embed key ships
in the client bundle, so the order matters.

---

## Sequencing summary

| Wave | Scope | Size | Behaviour change | Depends on | Risk |
|---|---|---|---|---|---|
| 0 | Session liveness for access tokens | small-medium | **yes** | — | medium |
| 1 | Coverage on the money path + the ratchet | large | no | — | low |
| 2 | The portal suite | large | no | — | medium effort |
| 3 | Break the two runtime cycles | medium | no | — | medium |
| 4 | Finish the strangler | large | no | 1, 3 | medium-high |
| 5 | Credential and document hygiene | small | yes (key rotation) | — | low |

Suggested calendar: Waves 0, 1, 2, 3 and 5 in parallel across people; Wave 4 as a sequence of
path-family PRs once 1 and 3 have landed.

---

## Open decisions — these need a call before the wave starts

1. **Wave 0, the failure policy.** Fail-closed with a 60 s grace window (recommended), or fail-open
   on a DB error? The first guarantees revocation within a bounded window and risks an auth
   interruption on a D1 blip; the second guarantees availability and leaves revocation to the
   token's own expiry during an outage. Recommendation: **fail-closed with grace**.
2. **Wave 0, the revocation semantics.** Session liveness only, or session liveness **plus** the
   `oauthAccessToken.revoked` flag? The flag exists in the schema and is unchecked. Recommendation:
   **both** — the flag covers "a person revoked the grant", the session covers sign-out.
3. **Wave 1, the gate shape.** Ratchet (recommended) or absolute floor? An absolute floor fails the
   build on day one and teaches the team to ignore it.
4. **Wave 2, the scope.** The full portal suite, or consent + Stripe webhook only for now? The
   recommendation is the full set — but consent and the webhook are the two that have already
   shipped broken, so they can go first if time is short.
5. **Wave 4, the decision.** Finish the strangler, or record the legacy/ported split as the
   intended design? The recommendation is to **finish it**; the alternative is to delete the
   "strangler fallback" language from `src/routes.ts` and own the split deliberately.

---

## What this plan deliberately does not do

- **It does not touch the route table's design.** One ordered inventory with declarative auth and
  rate limiting, shared by the dispatcher, the portal's forwarding decision and the OpenAPI coverage
  test, is the strongest structural decision in the repository. Wave 4 reduces the table's
  `legacy` count; it does not redesign it.
- **It does not change the billing-invariants gate's rules.** They are right. Wave 1 adds a
  *coverage* gate beside it, not new rules inside it.
- **It does not set coverage targets on declarative surfaces.** `src/docs.ts` (`createOpenAPISpec`,
  an OpenAPI object literal) and `src/embed.ts` (`createEmbedScript`, a template literal holding the
  widget JS) are data, not logic. A coverage percentage on them is noise.
- **It does not touch the discovery / marketing surfaces' code.** Out of scope for this review.
- **It does not propose a rewrite of anything.** Every wave is a move, a test, or a gate.
