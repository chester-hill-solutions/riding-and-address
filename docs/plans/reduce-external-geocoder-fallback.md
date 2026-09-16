# Reducing External Geocoder Fallback

Source: fallback-chain investigation 2026-09-15 (this session). Grounded in `src/oda-geocoding.ts`,
`src/geocoding.ts`, `src/geocode-query.ts`, `src/geocode-region.ts`, `src/oda-config.ts`,
`src/config.ts`, `src/metrics.ts`.

Goal: cut how often a lookup leaves the local address data (ODA/NAR in D1) and calls GeoGratis or
the configured external provider — without increasing wrong-riding results. This is a recall
problem, not a matching-algorithm problem; the fuzzy tier is only one of four leaks.

## Why it matters

Every fallback costs latency (5–10s stage timeouts vs milliseconds locally), money (Google),
availability (external 5xx / rate limits), and consistency (the external provider's answer can
disagree with the local one — see the `M5V2T6` postal-vs-point divergence in
`docs/comparison-opennorth.md`). The OpenNorth robustness run recorded 47 lookup errors, almost all
30s geocoding timeouts under load, while ODA itself never tripped its breaker.

## What "fallback" means today

`geocodeIfNeeded` (`geocoding.ts:733–907`) runs the local ODA stage first (`runOdaGeocodeStage`,
`633–695`), then GeoGratis, then the configured provider (`GEOCODER`, `google` in prod).

Local methods, in order (`geocodeWithOdaInner`, `oda-geocoding.ts:574–761`):

| # | Method | Confidence | Gate that ends it |
|---|---|---|---|
| 1 | exact | 1.0 | `search_key IN (…)` hit; ambiguity across municipalities throws `AMBIGUOUS_LOCATION` (`291–298`) |
| 2 | street interpolation | 0.75 | exact `street_key` + exact/nearest civic, else street-range centroid (`401–430`) |
| 3 | postal centroid | 0.85 | `postal_code` + province, **within 5000m of a lat/lon hint** (`550–558`) |
| 4 | city centroid | 0.45 | inline `>= minConfidence` check (`733`), not `assertConfidence` |
| 5 | nearest neighbour | 0.7 formula | needs a lat/lon hint; bbox expansion then haversine (`495–548`) |

### Every condition that leaves local (`runOdaGeocodeStage:675–694` swallows all of these and falls
through to GeoGratis)

1. `AMBIGUOUS_LOCATION` — street-only queries, alias matches spanning >1 former municipality
   (e.g. Toronto), city-centroid multiple/fuzzy matches.
2. `ADDRESS_NOT_FOUND` — every local method missed (typos, wrong/missing street type, new
   addresses, rural gaps).
3. `PROVINCE_NOT_LOADED` — NL, NU, YT are not in `ODA_PROVINCES`; every lookup there is external.
4. `LOW_CONFIDENCE_GEOCODE` — e.g. nearest-neighbour beyond ~4 km, or any method below
   `ODA_MIN_CONFIDENCE`.
5. ODA disabled / `ODA_DB` unbound; ODA circuit open.
6. Postal centroid found but farther than the 5000m hint gate — silent fall-through.

(ODA stage timeout and D1 errors are `rethrow`s, not fallbacks.)

## The measurement problem (blocks everything)

There is **no counter for external provider usage or fallback rate**. `geocodingSuccesses` and
`geocodingCacheHits` merge local and external; `geocodingFallbackTime`/`geocodingGeoGratisTime` are
cumulative timings with no call counts; `geocodingErrors` and `odaStageTimeouts` are declared but
never written. ODA method attribution (exact vs street vs postal vs nearest) is equally invisible.
There is also no labelled miss corpus — `opennorth-results.json` records status/error text but not
which provider resolved.

You cannot reduce a rate you do not measure, and shadow-testing (below) depends on this. This is
why it is Wave 0.

## Leak taxonomy, by expected volume

| Class | Cause | Fixable locally? |
|---|---|---|
| A. Avoidable gates | city centroid disabled at default config; nearest-neighbour distance coupled to min confidence; postal-hint 5000m gate unset in `wrangler.jsonc` | Yes, config/logic |
| B. Matching recall | street-name typos, missing/wrong street type or direction, city typos, unit formats | Yes, fuzzy/normalization |
| C. Coverage | NL/NU/YT absent from ODA; addresses built after 2021 | Yes — NAR now covers all of Canada |
| D. Genuine | rural addresses with no local civic point, non-Canadian input | No |

## Guardrails (hold throughout)

- **City-scoped.** A fuzzy street candidate is only considered within the query's city keys, never
  across municipalities. This is what keeps a typo from resolving to a different riding.
- **Single candidate.** Fuzzy resolves only when exactly one candidate clears the similarity
  threshold; otherwise refuse (`AMBIGUOUS_LOCATION`) rather than guess.
- **Confidence-honest.** Fuzzy methods report a confidence below `exact`; the caller-visible
  `geocodeMethod` must say which method fired.
- **Reversible.** Every behaviour change ships behind an env flag and defaults off until shadow
  data justifies it.
- **No accuracy regression.** Acceptance is not "fallbacks down" but "fallbacks down *and*
  OpenNorth-corpus disagreements do not rise".

---

## Wave 0 — Instrument and baseline  *(implemented 2026-09-15; baseline window still to be captured)*

Landed as `Metrics.geocodingOdaMethod*` (per local method), `geocodingOdaMiss*` (per contract
code), and `geocodingExternal*` (per provider). `getMetricsSummary().geocodingFallback` reports the
method mix, miss reasons, provider calls, and a derived `fallbackRate` (external calls as a share
of local + external resolutions): `test/metrics.test.ts`. Remaining from this wave: capture a
baseline over a fixed window and freeze the labelled miss corpus.

1. Add counters: `geocodingOdaMethod{exact,street,postal,city,nearest}`,
   `geocodingOdaMiss{reason}`, `geocodingProviderCalls{geogratis,google,mapbox,nominatim}`,
   `geocodingFallbackRate` (derived). Write the currently-dead `geocodingErrors` and
   `odaStageTimeouts`.
2. Emit one structured log per leave-local event: `{event:"geocode_fallback", reason, methodTried,
   postal?, city?, province?, hadHint}`. No PII beyond what is already logged.
3. Surface on `/metrics` and the admin `/health` branch: fallback rate, per-method split,
   per-provider calls.
4. Capture a baseline over a fixed window and freeze a labelled corpus: run the OpenNorth cases
   (`scripts/compare-opennorth.ts`) recording `geocodeMethod` and resolving provider per case, and
   add a `test/fixtures/geocode/misses.json` corpus of known fallbacks.

**Done when.** `GET /metrics` shows a fallback rate; every external call is attributable to a
reason; a baseline number exists in this doc.

**Risk.** None to behaviour. Small metric-field surface.

---

## Wave 1 — Close avoidable local exits  *(config/logic, each flagged)*

Ordered by expected payoff per unit of risk.

1. **Set the postal-hint gate explicitly.** `ODA_MAX_POSTAL_CENTROID_DISTANCE_METERS` is unset and
   defaults to 5000m (`oda-config.ts:8`), silently sending distant postal hits external. Decide the
   value deliberately per province size; make it explicit in `wrangler.jsonc`. *(Low risk: postal
   centroid confidence is 0.85 and the gate only widens.)*
2. **Decouple nearest-neighbour distance from min confidence.** Today
   `confidence = min(0.7, max(0.3, 1 - d/10000))` and the `assertConfidence` gate at 0.6 makes the
   configured 25km reverse cap an effective ~4km cap (`oda-geocoding.ts:120–124, 149–158`). Give NN
   an explicit distance gate (`ODA_NN_MAX_DISTANCE_METERS`) and a confidence formula that is not a
   back-door distance limit.
3. **Give `city_centroid` a deliberate fate.** At the default 0.6 min confidence it is dead
   (0.45), so city-only queries always leave local (fixture `case-8` encodes this). Two options:
   (a) leave it dead and improve *address*-level recall instead; (b) enable it only for
   `/api/geocode` (where 0.45 is labelled to the caller) and **not** for riding lookups, where a
   city centroid can land in the wrong riding. Recommendation: **(b)** — reduces fallback and
   external spend on the geocoding product without risking riding accuracy.
4. **Stop silently converting ambiguity into external spend on lookup routes.** `AMBIGUOUS_LOCATION`
   is surfaced on `/api/geocode` but swallowed on lookup routes (`geocoding.ts:687–692`). At
   minimum, count it (Wave 0) so the volume is known; then prefer a local disambiguation (postal,
   province, then nearest of the candidate municipalities) over an external call.

**Done when.** Each change is behind a flag; the OpenNorth disagreement count is unchanged; the
fallback rate delta is recorded per change.

**Risk.** Medium on 3/4 (wrong-riding); low on 1/2. Flags make each reversible.

---

## Wave 2 — Local fuzzy tier  *(recall; ships in shadow mode first)*

Insert a local tier between street interpolation and postal centroid, or between nearest-neighbour
and the external call. Two mechanisms, cheapest first:

1. **Type/direction-agnostic street match (no new index).** Match on street name + city, ignoring
   street type and direction, accepting only a single candidate. Today the type is only recoverable
   if the caller omitted it and it is in `DEFAULT_STREET_TYPES` (`oda-geocoding.ts:180–190`); a
   wrong or unusual type (e.g. `RISE`, `CONC`) misses. This alone should recover a large share of
   class-B misses.
2. **Trigram candidates + JS edit distance (new derived index).** Verified on D1: FTS5
   `tokenize='trigram'` works and matches substrings (`irchmount` → `Birchmount Road`) but is not
   edit distance (`Mian` does not match `Main`). So: build a trigram FTS table over street keys
   (the same source as `oda_street_ranges`), use it to fetch ~100 city-scoped candidates, rank with
   Levenshtein/Jaro-Winkler in JS, accept above `ODA_FUZZY_MIN_SIMILARITY`.
3. **Normalization/aliases (pure functions).** `St↔Saint`, `Mt↔Mount`, `Ft↔Fort`, ordinals
   (`1st↔First`), French/English (`RUE↔ST`, `CHEMIN↔RD`); extend `expandStreetAddress`.
4. **City-name fuzzy** for *scoping* only (typo'd city should still find the right city keys) —
   never for coordinates.

**Shadow mode.** When the local cascade misses and an external provider answers, also compute the
fuzzy tier and log `{fuzzyCandidate, externalResult, distanceMeters, similarity}` without changing
the response. Promote to live when fuzzy and external agree within a small distance on a
sufficiently large sample; this measures precision before any user sees it.

**Done when.** Shadow agreement rate is published; the tier is enabled for one province
(`ODA_FUZZY_PROVINCES`) with no rise in wrong-riding; index rebuild is a script like
`build:oda:suggest`.

**Risk.** Medium. Mitigated by city scoping, single-candidate, threshold, and shadow-first.

---

## Wave 3 — Close coverage gaps

1. **NL, NU, YT.** Every lookup in these provinces is external today because they are absent from
   `ODA_PROVINCES`. The NAR (June 2026) covers all of Canada, so importing them removes
   `PROVINCE_NOT_LOADED` fallbacks entirely. This is the single largest deterministic reduction
   available, and it builds on the NAR city-scoped importer already landing.
2. **Post-2021 addresses.** The ODA collection period is 2021; the NAR refresh brings new
   developments into local data, turning `ADDRESS_NOT_FOUND` misses into hits as cities migrate.

**Done when.** `ODA_PROVINCES` includes NL/NU/YT; a sample of NL/NU/YT addresses resolves locally;
fallback rate drop is attributed to the coverage change.

**Risk.** Low mechanically; note the D1 size headroom (currently 3.47GB of 10GB).

---

## Wave 4 — Make fallback visible to callers

External results currently carry no `geocodeMethod`/`confidence`/`dataSource`
(`geocoding.ts:817–830, 887`), so a caller cannot tell a local answer from a paid external one.
Attach `{ geocodeMethod: 'external', provider, confidence }` and surface `dataSource` on lookup
responses. Add an optional "did you mean" from the fuzzy tier on misses. This is honesty, not
recall, but it makes the metric meaningful to customers and is a prerequisite for any per-provider
routing policy.

**Risk.** Low (additive response fields); check the return-selector contract and OpenAPI snapshot.

---

## Acceptance

- A published baseline fallback rate, then a measured reduction, attributed per wave.
- No increase in OpenNorth-corpus disagreements (the accuracy guardrail).
- Every fallback carries a reason code; per-provider call counts visible on `/metrics`.
- All new behaviour flag-gated and reversible with no data migration.

## Worked example — `2, WELBY CRCL, M4B 2Y8`

Ground truth in the NAR: **2 Welby Cir, EAST YORK, ON M4B 2Y8**, street name `Welby`, type
`CIR`. Nothing in the data uses `CRCL`. The input failed for four independent reasons, only one of
which is genuinely fuzzy:

| # | Defect | Status |
|---|---|---|
| 1 | Comma after the civic (`2, WELBY…`) fails the civic regex, which requires whitespace; the whole string became the street name | **Fixed** — `extractAddressParts` normalises a leading `N,` and splits on commas |
| 2 | An embedded postal code and province were never extracted, so the query had no context and looked street-only | **Fixed** — postal/province/city are pulled out of the address string; explicit params still win |
| 3 | `CRCL`/`CIRCL`/`CIRCLE` were not recognised street types, so `CRCL` stayed in the name instead of becoming `CIR` | **Fixed** — aliases added (safe: none of them occur in the stored vocabulary, so no existing row is stranded) |
| 4 | The exact `search_key` embeds the city, so a city-less postal-bearing address can only reach the postal centroid | **Follow-up** — a postal-scoped street+civic match would resolve the exact civic point instead of a centroid |

Defects 1–3 are normalization, not fuzzy matching; they are exactly the class-B misses that inflate
the fallback rate. Defect 4 is the one that needs a new local tier, and is the smallest version of
Wave 2: scope by postal code rather than by city.

Regression tests: `test/oda-normalize.test.ts` covers the exact input, embedded city/province,
city-only strings, unit suffixes followed by a postal code, and the Circle aliases.

## Open questions

1. How often is the fallback caused by `AMBIGUOUS_LOCATION` rather than `ADDRESS_NOT_FOUND`? (Wave 0
   answers this and it decides how much Wave 1.4 is worth.)
2. What similarity threshold keeps false positives below the OpenNorth disagreement budget?
3. Is the city-centroid recommendation (enable for `/api/geocode` only) acceptable product-wise, or
   should it stay dead everywhere?
4. Trigram index size vs D1 headroom once ON + QC are indexed street-wide.
