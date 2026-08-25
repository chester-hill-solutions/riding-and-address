# Architecture Deepening Plan — riding-and-address

Source: architecture review 2026-08-25 (`/tmp/architecture-review-20260825-150020.html`).
Goal: turn the friction findings into deep modules at named seams, in an order that keeps `main` shippable and the Worker deployed at every step.

## Ground rules (every wave)

- **CI green + deployed** at the end of each wave. The audit gate (`bun audit --audit-level=high`, bun 1.3.14) must stay clean.
- **ADR guardrails**: ADR-0002 (never fail-closed on Stripe for lookups), ADR-0004 (no dual-serve window; dataset pin hard-fails), ADR-0005 (`httpStatusForKeyDenial` stays the sole status map; allowance/fuse literals stay allowlisted). Nothing here reopens them.
- **Vocabulary**: module / interface / depth / shallow / seam / adapter / leverage / locality. Interfaces are designed before code moves.
- Each wave ends with a short ADR or CONTEXT.md touch if a new domain concept got named.

---

## Dependency shape

```
Wave 0 ──────────────► done (independent, closes a correctness skew)
Wave 1 ──► Wave 3      (response-policy sweep lands after routes stop moving)
Wave 1 ──► Wave 2      (geocoder seam rewires what Wave 1 extracted)
Wave 1 ──► Wave 4      (ports attach where the core extraction put them)
```

Waves 2, 3, 4 are mutually independent once Wave 1 lands.

---

## Wave 0 — One queue client, stop the Enterprise drift  *(Candidate 3 · small)*

**Why first.** Only wave that changes behaviour, and it removes silent divergence between synchronous `/batch` and queued Enterprise jobs.

1. Create `src/queue-client.ts`: one module wrapping all ten Queue DO routes (`enqueue`, `status`, `retry`, `dead-letter`, `retry-dead-letter`, `health`, `job`, `batch`, …). Interface: typed methods taking/returning types from `types.ts`. Delete the four copies in `batch.ts:204–276` and `worker.ts:1098–1111`.
2. Delete `queue-manager.ts:42–66` forked types; import `BatchLookupRequest/Response/QueryParams` from `types.ts`. Verify no field loss on serialisation round-trip (test: enqueue → DO receives identical QueryParams incl. `return`, `include_province`, `geocode_method`).
3. Point queue processing at the cached `LookupRidingFn` adapter (`worker.ts:134–171`) instead of raw `lookupRidingFromR2`, so batch results agree with realtime. Keep the raw adapter only if queue-manager needs cold semantics — decide by reading its call sites, not by habit.
4. Fold `MAX_BATCH_SIZE` duplicates (`batch.ts:21`, `:314`) into `BATCH_CONFIG`.

**Done when.** No `idFromName('main-queue')` outside `queue-client.ts`; grep finds one `QueryParams`; vitest covers client round-trip + param preservation; parity test: same query through sync and queued paths returns same riding.

**Risk.** Low. Deploy behind existing queue; DO routes unchanged.

---

## Wave 1 — Free the Riding lookup core  *(Candidate 1 · large, highest leverage)*

**Interface first.** Design `RidingLookupCore` before moving code:

```
createRidingLookupCore(deps) -> { lookup(dataset, query): Promise<RidingResult>, loadDataset(key), warm(keys?) }
deps = { env bindings used today, breaker executor, timeouts, metrics sink }
```

One construction site in `worker.ts` startup. Everything else consumes the instance.

1. Move `loadGeo` (174–247), `lookupRiding` (134–171), spatial-query helpers (250–295), LRU wiring, retry/validation/breaker/metrics plumbing into `src/riding-lookup-core.ts`.
2. Collapse `handleLookupRequest`'s nine runtime params (`startTime`, `correlationId`, `getCorsHeaders`, `ctx`, `billingFromAuth(auth)`, …) into a `RequestContext` assembled once per request at startup of `fetch`.
3. Re-point callers: routes, cache warmer (`cache.ts` currently receives `loadGeo`/`lookupRiding` as callbacks — delete those parameters), queue processing (from Wave 0).
4. Typed errors replace magic strings while touching this code: `CircuitBreakerOpenError` replaces `'Circuit breaker is OPEN'` string matching at `geocoding.ts:729,922` and `worker.ts:241`; breaker adapters (`{ execute }` narrowing ×4) collapse into the deps object.
5. Extract the cron body (`handleScheduled`, 103–131) to use the core directly.

**Tests.**
- Core unit tests against the existing fake env helper (`test/helpers/lookup-test-env.ts`) — D1-first, LRU-hit, R2-cold paths each asserted through `lookup()`.
- Existing integration tests (`lookup-api.integration.test.ts`) keep passing unchanged — they already test past HTTP, which is the point.
- Breaker-open behaviour asserted via error type, not message substring.

**Done when.** `worker.ts` contains no R2/LRU/breaker/metrics code; `grep -c "Circuit breaker is OPEN"` in src = 0; all suites green; production deploy verified with province-parity probes (reuse `spatial-baseline.sh`).

**Risk.** Broad but mechanical; the behaviour is already pinned by integration tests + today's production probes.

---

## Wave 2 — Give geocoding a provider seam  *(Candidate 2 · medium-large)*

1. Define `GeocoderProvider` interface: name, `geocode(query): Promise<GeocodeCandidate[]>`, failure modes as typed errors (`ProviderUnavailableError`, `NoResultsError` — subsuming the breaker-open type from Wave 1).
2. Registry replaces the string dispatch chain (`geocoding.ts:874–904`). Fallback order becomes data (array of providers), not control flow.
3. Merge `geocodeWithNominatimFallback` (592–623) into `geocodeWithNominatim` (645–672) — one adapter, config flag for fallback behaviour.
4. All seven outbound fetches take timeout from `getTimeoutConfig` (delete hardcoded `AbortSignal.timeout(10000)` at 415, 486, 557, 607, 633, 660, 975).
5. `geocodeIfNeeded(env, qp, request?, metrics?, circuitBreaker?, deferTask?)` → `geocodeIfNeeded(request, { providers, breaker, deferTask, metrics })` options object; delete the three rival type declarations (`lookup-expansion.ts:52–65`, `batch.ts:28–37`) in favour of one canonical export.

**Tests.** Provider contract tests run the same fixture set against every adapter (currently only Google/ODA have coverage); breaker-open asserted via type.

**Done when.** Adding a provider = adding one adapter + registry entry (verified by registering the stub provider in tests); no caller imports a concrete provider.

**Risk.** Geocoding is revenue-critical; land behind the existing circuit breakers, ship one provider migration at a time if needed.

---

## Wave 3 — Response policy in one place  *(Candidate 5 · small-medium, mechanical)*

1. Every Response goes through `resolveCorsOrigin` + `securityHeaders`. Sweep the 33 wildcard literals (`worker.ts:373–1135`, `oda-handlers.ts:202–209`). Admin/diagnostic routes get explicit origin policy rather than `*`.
2. One Fuse-denial shaper module beside `httpStatusForKeyDenial` (ADR-0005 vocabulary): input = denial reason + correlationId, output = Response. Replace the three dialects (`lookup-handler.ts:89–102`, `oda-handlers.ts:247–265`, `worker.ts:932–957`). Batch redaction loop (932–957) uses it per item.
3. Merge webhook admin surfaces (`480–524` vs `772–868`) into one webhook module serving both URI namespaces; delete the v1/v2 copy-paste handlers. **Status: remaining** — the two surfaces mask secrets differently (v1 omits `secret`, v2 masks it and adds `maxFailures`) and gate auth at different granularities; merge needs an explicit redaction decision first.
4. Remove the `initializeWebhookProcessing(env)` init ritual from the fetch path (`worker.ts:331`) — fold into module state or the core from Wave 1. **Status: remaining** (paired with 3).

**Done when.** `grep "'Access-Control-Allow-Origin': '\*'" src/` returns 0 outside `http-headers.ts`; one function builds every Fuse-denied response; webhook handlers exist once.

**Risk.** Low; header changes need a staging smoke of embed + portal origins (Browser key allowlist interacts with CORS here).

---

## Wave 4 — Storage seams, incrementally  *(Candidate 4 · large, ongoing)*

Introduce three ports where variation is real. Order inside the wave follows pain, not sequence:

1. **Usage ledger port** (billing): interface = `consume(customer, month, units) -> { allowed, ... }`. Production adapter wraps the `API_KEY_USAGE` DO HTTP contract; billing tests consume the port instead of re-implementing the wire format (`test/billing.test.ts:15–34`). Smallest, self-contained — start here.
2. **KV store port** (caches): `getJson(key) / putJson(key, value, ttl)` with TTL semantics owned once. Collapses the four hand-rolled KV protocols (`geocoding.ts:112–263`, `cache.ts:505–630`); deletes the tripled KV fake literal in `test/geocoding.test.ts`.
3. **Dataset source port**: formalises what Wave 1's core already hides; lets `queue-manager` (946 lines, zero tests) gain its first tests via an in-memory dataset source.

Also: split `cache.ts` — the warming orchestrator (15–43 popular-cities lists, `geocodeIfNeeded` import) is a scheduler job wearing a cache name; rename/move it out.

**Done when (per port).** No non-worker file references `Env.<binding>` for that concern; fakes implement intent, not Cloudflare shapes; suite green without 60s timeouts (`vitest.config.ts:8–13` can come back down).

**Risk.** Largest surface. Never big-bang: one port, one PR, shipped and observed before the next.

---

## Sequencing summary

| Wave | Candidate | Size | Behaviour change | Depends on |
|---|---|---|---|---|
| 0 | Queue client + drift | small | yes (skew closes) | — |
| 1 | Lookup core extraction | large | no | — |
| 2 | Geocoder seam | medium-large | no | Wave 1 |
| 3 | Response policy locality | small-medium | headers only | Wave 1 |
| 4 | Storage seams | large, incremental | no | Wave 1 |

Suggested calendar: Wave 0 + Wave 1 in one focused stretch (they share files); Waves 2–3 as independent follow-ups; Wave 4 as standing incremental work whenever a bug lands near a port.
