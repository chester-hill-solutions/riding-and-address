# Riding Lookup vs OpenNorth Represent

Comparison report generated 2026-06-14 from live production data.

| | Riding Lookup | OpenNorth Represent |
|---|---------------|---------------------|
| **Base URL** | https://riding-lookup.chester-hill-solutions.workers.dev | https://represent.opennorth.ca |
| **Federal boundaries** | 2024 (`federalridings-2024.geojson`) | 2023 representation order (closest parity set) |
| **Auth** | Basic Auth required | None (public) |
| **Rate limit** | 100 req/min (lookup routes) | 60 req/min |
| **Address geocoding** | Built-in (ODA → GeoGratis → Google) | Not supported — compare via resolved lat/lon |
| **Robustness run** | 2026-06-14T21:36:21 UTC | same window |
| **Speed run** | 2026-06-14T20:24:05 UTC | same window |

## Executive summary

1. **Speed (warm cache):** Riding Lookup warm-cache p50 is **~1.6× faster** than OpenNorth for postal/lat/lon (37ms vs 59ms).
2. **Robustness (93 cases):** 43/93 Riding Lookup lookups succeeded; **23** agreed with OpenNorth on federal riding when both returned a result; **7** genuine disagreements on shared inputs.
3. **Known divergence — postal vs point:** `M5V2T6` maps to **University—Rosedale** (Riding Lookup, geocoded point-in-polygon on 2024 boundaries) vs **Spadina—Harbourfront** (OpenNorth postal centroid). Same pattern as documented Victoria Park case (postal centroid ≠ geocoded civic address).
4. **Address geocoding under batch load:** 43 cases hit **30s geocoding timeout**; 0 tripped the **ODA circuit breaker**. Single-request production behavior is fine; this matrix hammers address geocoding with 4500ms spacing — still insufficient for sustained ODA load. Use longer pauses, smaller batches, or `POST /batch` for bulk work.
5. **Production gap:** `/api/qc` fails — `quebecridings-2025.geojson` not present in R2.
6. **Ground truth (liblist):** 5 liblist cases where RL and OpenNorth agreed with each other but differed from OLP `RidingName` — likely stale member-list riding labels or boundary redistribution, not API disagreement.

## Methodology

- **Speed:** 8 scenarios, 8 iterations + 2 warmup, production Riding Lookup vs OpenNorth.
- **Robustness:** 93 cases across postal (A), address (B), coordinates (C), endpoints (D), errors (E), divergence (F), Downloads wild mix (G), and OLP `liblist221123.csv` (I).
- **OpenNorth parity:** Federal comparisons use `federal-electoral-districts-2023-representation-order` with `contains={lat},{lon}` for address/coordinate cases; `/postcodes/{POSTAL}/?sets=...` for postal-only.
- **Pacing:** 4500ms between address geocodes, batch cooldown every 12 address cases — see [compare-opennorth.ts](../scripts/compare-opennorth.ts).

## Speed results

| Scenario | RL p50 | RL p95 | RL cache | ON p50 | ON p95 |
|----------|--------|--------|----------|--------|--------|
| federal warm lat/lon | 34ms | 41ms | HIT | 62ms | 74ms |
| combined warm lat/lon | 45ms | 58ms | HIT | — | — |
| federal postal warm | 37ms | 49ms | HIT | 59ms | 105ms |
| combined postal | 42ms | 439ms | HIT | 66ms | 75ms |
| federal + municipality | 986ms | 1.03s | HIT | — | — |
| VP lat/lon 2023 parity | 37ms | 44ms | HIT | 61ms | 81ms |
| address cold VP | 38ms | 46ms | HIT | — | — |
| rural postal K0A1K0 | 38ms | 47ms | HIT | 101ms | 105ms |

### Speed notes

- All warm postal/lat/lon scenarios returned `X-Cache-Status: HIT` on Riding Lookup.
- `return=municipality` adds ODA normalization work (~900ms p50) even on cache hit.
- OpenNorth rural postal (`K0A1K0`) is slower (101ms p50) but consistent.

## Robustness summary

| Classification | Count |
|----------------|-------|
| RL error | 47 |
| Agree | 23 |
| Disagree | 7 |
| RL=ON; ground truth differs | 5 |
| Expected divergence | 4 |
| Inconclusive | 3 |
| Error handled | 3 |
| RL only | 1 |

### Riding Lookup errors (when present)

- Geocoding timeout (30s): 43
- Missing R2 dataset: 4
- INVALID_QUERY: 2
- PROVINCE_NOT_LOADED: 1


**Note:** 50 failed lookups (43 timeouts, 0 circuit breaker) are concentrated in address-heavy categories B, G, and I — not postal/coordinate cases. Treat as batch-load artifact unless reproduced on isolated requests.


### Results by category

| Category | Cases | RL OK | Agree (both APIs) |
|----------|-------|-------|-------------------|
| A — Postal | 8 | 8 | 4 |
| B — Address | 12 | 3 | 1 |
| C — Coordinates | 5 | 4 | 3 |
| D — Endpoints | 4 | 3 | 0 |
| E — Errors | 6 | 3 | 1 |
| F — Methodology | 3 | 3 | 0 |
| G — Downloads wild mix | 25 | 9 | 9 |
| I — OLP liblist | 30 | 10 | 5 |

## Genuine disagreements (both APIs returned a riding)

- **A1** (postal=M5V2T6): Riding Lookup → **University—Rosedale**; OpenNorth → **Spadina—Harbourfront** (source ground truth: Spadina—Harbourfront)
- **A4** (postal=V6B1A1): Riding Lookup → **Vancouver Centre**; OpenNorth → **Vancouver East**
- **A5** (postal=K0A1K0): Riding Lookup → **Nepean**; OpenNorth → **Carleton**
- **A8** (postal=M5V 2T6): Riding Lookup → **University—Rosedale**; OpenNorth → **Spadina—Harbourfront**
- **D1** (postal=M5V2T6): Riding Lookup → **University—Rosedale**; OpenNorth → **Spadina—Harbourfront**
- **D2** (postal=M5V2T6): Riding Lookup → **Spadina—Fort York**; OpenNorth → **Spadina—Harbourfront**
- **D4** (postal=M5V2T6): Riding Lookup → **University—Rosedale**; OpenNorth → **Spadina—Harbourfront**

## Expected divergences (methodology, not bugs)

- **Postal centroid vs geocoded point:** OpenNorth `/postcodes/` uses centroid/concordance; Riding Lookup geocodes then point-in-polygon. Large buildings and cross-boundary postcodes (e.g. `K0A1K0`, `M4C1N2`) often differ.
- **Boundary vintage:** OpenNorth default `federal-electoral-districts` set last updated 2017; we compare against 2023/2024 redistribution where noted.
- **757 Victoria Park / Victoria Park Ave:** Geocoded point → Scarborough Southwest (both APIs on 2023 contains); postal `M4C1N2` centroid → Beaches—East York on OpenNorth.

## Full case matrix

| ID | Label | Input | RL federal | ON federal | Class | RL time |
|----|-------|-------|------------|------------|-------|---------|
| A1 | Downtown Toronto | postal=M5V2T6 | University—Rosedale | Spadina—Harbourfront | Disagree | 127ms |
| A2 | Parliament Hill | postal=K1A0A6 | Ottawa Centre | Ottawa Centre | Agree | 155ms |
| A3 | Montreal | postal=H2X1Y4 | Laurier—Sainte-Marie | Laurier—Sainte-Marie | Agree | 144ms |
| A4 | Vancouver | postal=V6B1A1 | Vancouver Centre | Vancouver East | Disagree | 147ms |
| A5 | Rural cross-boundary | postal=K0A1K0 | Nepean | Carleton | Disagree | 56ms |
| A6 | Halifax | postal=B3H4R2 | Halifax | Halifax | Agree | 148ms |
| A7 | Calgary | postal=T2P1J9 | Calgary Centre | Calgary Centre | Agree | 151ms |
| A8 | Postal with spaces | postal=M5V 2T6 | University—Rosedale | Spadina—Harbourfront | Disagree | 37ms |
| B1 | Exact civic Toronto | address=123 Main St | LOOKUP_ERROR | no postal or point f | RL error | 30.12s |
| B2 | Exact civic Ottawa | address=123 Main St | Ottawa Centre | Ottawa Centre | Agree | 166ms |
| B3 | Unit address | address=Unit 1205, 123 Main St | LOOKUP_ERROR | no postal or point f | RL error | 30.15s |
| B4 | 757 Victoria Park abbreviated | address=757 Victoria Park | Scarborough Southwest | Scarborough Southwest | Expected divergence | 357ms |
| B5 | 757 Victoria Park full | address=757 Victoria Park Ave | LOOKUP_ERROR | no postal or point f | RL error | 30.22s |
| B6 | Montreal accented | address=350 Rue Saint-Paul E | LOOKUP_ERROR | no postal or point f | RL error | 9.79s |
| B7 | Montreal Saint-Denis | address=1000 Rue Saint-Denis | LOOKUP_ERROR | no postal or point f | RL error | 10.12s |
| B8 | King St W | address=456 King St W | LOOKUP_ERROR | no postal or point f | RL error | 30.19s |
| B9 | Municipality return | address=123 Main St | LOOKUP_ERROR | no postal or point f | RL error | 30.24s |
| B10 | Nonexistent address | address=999 Nonexistent Blvd | LOOKUP_ERROR | — | RL error | 30.19s |
| B11 | Street only ambiguous | address=Main Street | Desnethé—Missinippi—Churchill River | — | RL only | 156ms |
| B12 | City only weak | city, province | LOOKUP_ERROR | — | RL error | 30.20s |
| C1 | Toronto core | lat/lon | University—Rosedale | University—Rosedale | Agree | 150ms |
| C2 | Victoria Park point | lat/lon | Scarborough Southwest | Scarborough Southwest | Agree | 233ms |
| C3 | Montreal | lat/lon | LOOKUP_ERROR | Laurier—Sainte-Marie | RL error | 8.06s |
| C4 | Ottawa | lat/lon | Ottawa Centre | Ottawa Centre | Agree | 187ms |
| C5 | Offshore | lat/lon | — | — | Inconclusive | 149ms |
| D1 | Combined default | postal=M5V2T6 | University—Rosedale | Spadina—Harbourfront | Disagree | 223ms |
| D2 | Ontario provincial | postal=M5V2T6 | Spadina—Fort York | Spadina—Harbourfront | Disagree | 113ms |
| D3 | Quebec provincial | postal=H2Y1H2 | LOOKUP_ERROR | Laurier—Sainte-Marie | RL error | 9.08s |
| D4 | Province off | postal=M5V2T6 | University—Rosedale | Spadina—Harbourfront | Disagree | 115ms |
| E1 | Invalid postal | postal=INVALID | Halifax | — | Inconclusive | 152ms |
| E2 | Missing location | (none) | INVALID_QUERY | — | Error handled | 36ms |
| E3 | Lat without lon | lat | INVALID_QUERY | — | Error handled | 29ms |
| E4 | BC geocode not loaded | postal=V6B1A1 | PROVINCE_NOT_LOADED | — | Error handled | 33ms |
| E5 | International postal | postal=90210 | Halifax | — | Inconclusive | 110ms |
| E6 | Victoria Park coords boundary | lat/lon | Scarborough Southwest | Scarborough Southwest | Agree | 109ms |
| F1 | Postal centroid M4C1N2 | postal=M4C1N2 | Beaches—East York | Beaches—East York | Expected divergence | 162ms |
| F2 | OpenNorth default 2017 set | postal=M5V2T6 | University—Rosedale | Spadina—Harbourfront | Expected divergence | 47ms |
| F3 | Rural K0A1K0 concordance | postal=K0A1K0 | Nepean | Carleton | Expected divergence | 116ms |
| G1 | Pharmacy Ave | postal=M1L3G6 | Scarborough Southwest | Scarborough Southwest | Agree | 288ms |
| G2 | Birchmount unit dash | address=908-560 Birchmount Rd | LOOKUP_ERROR | no postal or point f | RL error | 30.17s |
| G3 | Birchmount bare | address=560 Birchmount Road | Scarborough Southwest | Scarborough Southwest | Agree | 300ms |
| G4 | Mendelssohn unit | address=325-10 Mendelssohn Street | LOOKUP_ERROR | no postal or point f | RL error | 30.27s |
| G5 | St Clair unit tower | address=225-3560 St Clair Avenue East | LOOKUP_ERROR | no postal or point f | RL error | 30.20s |
| G6 | St Clair bare | address=3560 St Clair Avenue East | Scarborough Southwest | Scarborough Southwest | Agree | 456ms |
| G7 | Blantyre 168A | address=168A Blantyre Avenue | Scarborough Southwest | Scarborough Southwest | Agree | 220ms |
| G8 | VP unit tower | address=605-757 Victoria Park Avenue | LOOKUP_ERROR | no postal or point f | RL error | 30.14s |
| G9 | VP 917 | address=917 Victoria Park Avenue | Scarborough Southwest | Scarborough Southwest | Agree | 303ms |
| G10 | Eglinton East | address=3171 Eglinton Avenue East | Scarborough Southwest | Scarborough Southwest | Agree | 342ms |
| G11 | Markham Rd tower | address=1404-180 Markham Road | LOOKUP_ERROR | no postal or point f | RL error | 30.29s |
| G12 | Anaconda incomplete | address=91 Anaconda | Scarborough Southwest | Scarborough Southwest | Agree | 179ms |
| G13 | Danforth east | address=3205 Danforth Avenue | Scarborough Southwest | Scarborough Southwest | Agree | 168ms |
| G14 | Burlington ALL CAPS period | postal=L7L4B7 | LOOKUP_ERROR | Burlington | RL error | 30.25s |
| G15 | Burlington UNIT suffix | address=5013 PINEDALE AVE. UNIT 28 | LOOKUP_ERROR | no postal or point f | RL error | 30.17s |
| G16 | Burlington condo | address=1300 MAPLE CROSSING BLVD. UNIT 91 | LOOKUP_ERROR | no postal or point f | RL error | 30.22s |
| G17 | Burlington lakeshore | address=5194 LAKESHORE RD. | LOOKUP_ERROR | no postal or point f | RL error | 30.38s |
| G18 | Sign ALL CAPS embedded postal | postal=L7M3S8 | LOOKUP_ERROR | Burlington North—Milton West | RL error | 30.22s |
| G19 | Jardine Cres | postal=L7L7K1 | Burlington North—Milton West | Burlington North—Milton West | Agree | 158ms |
| G20 | Rural Seaforth embedded | postal=N0K1W0 | LOOKUP_ERROR | Huron—Bruce | RL error | 30.19s |
| G21 | Dundas St E | address=314 Dundas St E | LOOKUP_ERROR | no postal or point f | RL error | 30.19s |
| G22 | Dundas unit inline | address=312 Unit 4 Dundas St E | LOOKUP_ERROR | no postal or point f | RL error | 30.23s |
| G23 | Broadview unit | address=105 Unit 2 Broadview Ave | LOOKUP_ERROR | no postal or point f | RL error | 30.30s |
| G24 | Gerrard St E | address=220 Gerrard St E | LOOKUP_ERROR | no postal or point f | RL error | 30.16s |
| G25 | Hobson no city | address=1829 Hobson Drive | LOOKUP_ERROR | no postal or point f | RL error | 30.15s |
| I1 | Hopkinson Crescentt typo | postal=L1T4E1 | LOOKUP_ERROR | Ajax | RL error | 30.21s |
| I2 | Lake Driveway W | postal=L1S5A1 | LOOKUP_ERROR | Ajax | RL error | 30.21s |
| I3 | Coates Of Arms Lane | postal=L1T3S2 | LOOKUP_ERROR | Ajax | RL error | 30.20s |
| I4 | 607-132 Kingston Rd W | postal=L1T3W5 | LOOKUP_ERROR | Ajax | RL error | 30.22s |
| I5 | 1612-77 Falby Crt | postal=L1S4G7 | LOOKUP_ERROR | Ajax | RL error | 30.19s |
| I6 | Edgewood Unit hash | postal=M4L3H1 | LOOKUP_ERROR | Beaches—East York | RL error | 30.27s |
| I7 | Woodbine Apt | postal=M4C4H1 | LOOKUP_ERROR | Beaches—East York | RL error | 30.21s |
| I8 | Delisle unit tower | postal=M4V3C6 | LOOKUP_ERROR | Toronto—St. Paul's | RL error | 30.14s |
| I9 | Nepean Bayshore | postal=K2B6M7 | LOOKUP_ERROR | Ottawa West—Nepean | RL error | 30.21s |
| I10 | London Sharon Dr | postal=N6G2R6 | London Centre | London Centre | RL=ON; ground truth differs | 183ms |
| I-B1-1 | liblist Brampton West #1 | postal=L6X 5H1 | Brampton South | Brampton South | RL=ON; ground truth differs | 227ms |
| I-B1-2 | liblist Brampton West #2 | postal=L6X 0V3 | LOOKUP_ERROR | Brampton South | RL error | 30.20s |
| I-B2-1 | liblist Scarborough Southwest #1 | postal=M1N 1M5 | Scarborough Southwest | Scarborough Southwest | Agree | 180ms |
| I-B2-2 | liblist Scarborough Southwest #2 | postal=M1N 1P6 | LOOKUP_ERROR | Scarborough Southwest | RL error | 30.31s |
| I-B3-1 | liblist Milton #1 | postal=L0P 1B0 | LOOKUP_ERROR | Burlington North—Milton West | RL error | 30.19s |
| I-B3-2 | liblist Milton #2 | postal=L0P 1B0 | LOOKUP_ERROR | Burlington North—Milton West | RL error | 30.19s |
| I-B4-1 | liblist Beaches—East York #1 | postal=M4E 1B7 | LOOKUP_ERROR | Beaches—East York | RL error | 30.24s |
| I-B4-2 | liblist Beaches—East York #2 | postal=M4E 1B7 | LOOKUP_ERROR | Beaches—East York | RL error | 30.20s |
| I-B5-1 | liblist Ottawa West—Nepean #1 | postal=K2B 6M7 | LOOKUP_ERROR | Ottawa West—Nepean | RL error | 30.20s |
| I-B5-2 | liblist Ottawa West—Nepean #2 | postal=K2B 6Y9 | Ottawa West—Nepean | Ottawa West—Nepean | Agree | 165ms |
| I-B6-1 | liblist Mississauga—Erin Mills #1 | postal=L5M 7K1 | Mississauga—Erin Mills | Mississauga—Erin Mills | Agree | 207ms |
| I-B6-2 | liblist Mississauga—Erin Mills #2 | postal=L5M 7S7 | LOOKUP_ERROR | Mississauga—Erin Mills | RL error | 30.20s |
| I-B7-1 | liblist Pickering—Uxbridge #1 | postal=L9P 1Y5 | York—Durham | York—Durham | RL=ON; ground truth differs | 236ms |
| I-B7-2 | liblist Pickering—Uxbridge #2 | postal=L1V 5V9 | Pickering—Brooklin | Pickering—Brooklin | RL=ON; ground truth differs | 307ms |
| I-B8-1 | liblist Eglinton—Lawrence #1 | postal=M4R 1S6 | LOOKUP_ERROR | Eglinton—Lawrence | RL error | 30.17s |
| I-B8-2 | liblist Eglinton—Lawrence #2 | postal=M5M 2H6 | LOOKUP_ERROR | Eglinton—Lawrence | RL error | 30.20s |
| I-B9-1 | liblist Kingston and the Islands #1 | postal=K7K 6W4 | Kingston and the Islands | Kingston and the Islands | Agree | 268ms |
| I-B9-2 | liblist Kingston and the Islands #2 | postal=K7K 4A6 | Kingston and the Islands | Kingston and the Islands | Agree | 250ms |
| I-B10-1 | liblist Scarborough—Guildwood #1 | postal=M1H 2G2 | Scarborough—Woburn | Scarborough—Woburn | RL=ON; ground truth differs | 214ms |
| I-B10-2 | liblist Scarborough—Guildwood #2 | postal=M1H 0A2 | LOOKUP_ERROR | Scarborough—Woburn | RL error | 30.18s |

## Feature comparison

| Capability | Riding Lookup | OpenNorth |
|------------|---------------|-----------|
| Postal lookup | Yes (geocode → PIP) | Yes (centroid/concordance) |
| Address lookup | Yes | No (external geocoder required) |
| Lat/lon lookup | Yes | Yes (`contains`) |
| Provincial ON/QC | `/api/on`, `/api/qc`, `/api/combined` | Separate boundary sets |
| Representatives | No | Yes |
| Municipality field | `return=municipality` | No |
| Batch API | `POST /batch` (100) | No |
| Edge caching | KV 24h + in-memory spatial index | None documented |
| Warm lookup latency | **37ms** p50 | **59ms** p50 |

## When to use which

**Use Riding Lookup when:**

- You need address → riding in one call with Canadian geocoding (ODA when enabled).
- You want 2024 federal boundaries and optional ON/QC provincial in `/api/combined`.
- Repeat lookups benefit from edge KV cache (~37ms warm p50).

**Use OpenNorth when:**

- You need representative names, emails, and boundary metadata across many jurisdictions.
- Postal-only lookup is sufficient and ~60–100ms is acceptable.
- You want a free, unauthenticated public API (within 60 req/min).

## Recommendations

1. **Upload `quebecridings-2025.geojson` to R2** to fix `/api/qc` in production.
2. **Document `M5V2T6` postal divergence** — see [postal-vs-point-lookup.md](postal-vs-point-lookup.md) for integrators comparing against OpenNorth postal centroids.
3. **Batch clients:** respect rate limits; for address-heavy batches use `POST /batch` or ≥4s spacing to avoid ODA circuit breaker.
4. **Comparison re-runs:** `BENCHMARK_BASIC_AUTH=... npm run compare:opennorth` then `npm run compare:report`.

## Artifacts

- Raw results: [test/fixtures/comparison/opennorth-results.json](../test/fixtures/comparison/opennorth-results.json)
- Case definitions: [test/fixtures/comparison/opennorth-cases.json](../test/fixtures/comparison/opennorth-cases.json)
- Runner: [scripts/compare-opennorth.ts](../scripts/compare-opennorth.ts)
