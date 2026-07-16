# ODA Fixture Acceptance Examples

These fixture cases define expected behavior. Tests in `test/oda-geocoding.test.ts`, `test/oda-fixture-cases.test.ts`, and `test/canada-post-format.test.ts` assert against these examples.

```bash
# Offline ODA tests (in-memory fixture DB)
npm run test:oda

# Live production ODA API (requires auth)
ODA_LIVE=1 BENCHMARK_BASIC_AUTH='user:pass' npm run test:oda:live
```

Fixture CSV: `test/fixtures/oda/fixture.csv`

## Case 1: Exact civic match (ON)

**Query:** `GET /api/geocode?address=123%20Main%20St&city=Toronto&province=ON`

**Expected:**
- `geocodeMethod`: `exact`
- `confidence`: `1.0`
- `matchedFields`: includes `civic`, `street`, `city`, `province`
- `mailingAddress.line1`: `123 MAIN ST`
- `mailingAddress.province`: `ON`

## Case 2: Postal centroid (ON)

**Query:** `GET /api/geocode?postal=M5V2T6`

**Expected:**
- `geocodeMethod`: `postal_centroid`
- `confidence`: `0.85`
- `mailingAddress.postalCode`: `M5V 2T6`

## Case 3: Unit address formatting (ON)

**Query:** exact match on address with unit `1205`

**Expected:**
- `mailingAddress.line1`: `UNIT 1205`
- `mailingAddress.line2`: `123 MAIN ST`

## Case 4: Accent-folded Montreal match (QC)

**Query:** `GET /api/geocode?address=350%20Rue%20Saint-Paul%20E&city=Montréal&province=QC`

**Expected:**
- `geocodeMethod`: `exact`
- City match succeeds with accent normalization (`Montréal` ↔ `MONTREAL`)
- `mailingAddress.municipality`: `MONTREAL`
- `mailingAddress.province`: `QC`

## Case 5: Duplicate street names in different cities

**Query:** `GET /api/geocode?address=123%20Main%20St&city=Ottawa&province=ON`

**Expected:**
- Returns Ottawa match, not Toronto match with same street name
- `geocodeMethod`: `exact`

## Case 6: Reverse geocode with distance

**Query:** `GET /api/reverse?lat=43.6532&lon=-79.3832`

**Expected:**
- `geocodeMethod`: `nearest_neighbor`
- `distanceMeters`: present and ≤ 25000
- `mailingAddress` populated

## Case 7: Ambiguous street-only refusal

**Query:** `GET /api/geocode?address=Main%20Street`

**Expected:**
- HTTP 422
- `code`: `AMBIGUOUS_LOCATION`

## Case 8: Low-confidence refusal

**Query:** vague location with confidence below threshold

**Expected:**
- HTTP 422
- `code`: `LOW_CONFIDENCE_GEOCODE`

## Case 9: BC postal geocode (StatCan ODA)

**Query:** `GET /api/geocode?postal=V6B1A1&province=BC`

**Expected:**
- HTTP 200
- `geocodeMethod`: `postal_centroid` (or `exact` when civic match exists)
- `mailingAddress.province`: `BC`

## Case 9b: NL not on StatCan ODA

**Query:** `GET /api/geocode?postal=A1C1A1&province=NL`

**Expected:**
- HTTP 404
- `code`: `PROVINCE_NOT_LOADED` (when ODA is enabled and NL is not in `ODA_PROVINCES`)

## Case 10: Combined riding lookup with ODA geocoding

**Query:** `GET /api/combined?address=123%20Main%20St&city=Toronto&province=ON`

**Expected:**
- ODA geocoding succeeds
- Federal riding in `properties`
- Ontario provincial riding in `province_data` when applicable
- Optional `geocodeMethod`, `mailingAddress` in response

## Case 11: Optional `return` selector with municipality

**Query:** `GET /api?return=municipality&address=123%20Main%20St&city=Toronto&province=ON`

**Expected:**
- Federal riding in `properties`
- `properties.MUNICIPALITY` set from ODA `mailingAddress.municipality` (e.g. `TORONTO`)
- Top-level `municipality` matches `properties.MUNICIPALITY`
- No `province_data` unless `include_province=true` is also requested (including on `/api/combined`, where `return=` disables the combined default)

## Case 12: OpenNorth parity — 757 Victoria Park

**Query:** `GET /api?include_province=true&address=757%20Victoria%20Park&city=Toronto&province=ON`

**Context:** OpenNorth reports Beaches-East York from postcode for this address; this service expects the provincial riding **Scarborough Southwest (SSW)** for the resolved point.

**Verified (production, 2026-06):**
- Geocoded point: `43.692101, -79.288688` (757 Victoria Park Ave, Toronto)
- Federal riding: Scarborough Southwest
- Provincial riding: Scarborough Southwest

**Expected:**
- Federal riding resolved for the geocoded point
- `province_data.riding` or provincial properties indicate Scarborough Southwest (not Beaches-East York)
- Document resolved coordinates in tests if live geocoding varies

## Case 13: Autocomplete ladder — street container to address

**Context:** `/api/search` returns street *containers* until the query names a single address.
Asserted in `test/oda-suggest.test.ts` and `test/search-route.integration.test.ts`.

| Query | Expected |
|-------|----------|
| `GET /api/search?q=ma` | `suggestions: []` — below `ODA_SUGGEST_MIN_QUERY_LENGTH`, and **zero D1 queries** |
| `GET /api/search?q=main` | Containers for every matching street; busier streets rank first |
| `GET /api/search?q=main st tor` | Narrowed to Toronto; `next: search`, `dataLevel: Street`, `addressCount` present |
| `GET /api/search?q=250 main st tor` | `next: lookup`, `dataLevel: Premise`, `addressComponents.civic_number: "250"` |
| `GET /api/search?q=251 main st tor` | Civic in range but no record → `dataLevel: RangedPremise`, `location` is the street centroid |

**Expected in every case:**
- No suggestion carries a `riding` field — riding is resolved separately from `location`
- `provinces` echoes what was searched (NL/NU/YT always return nothing; they are absent from ODA)

**Street-type expansion.** The index stores canonical types (`CRES`, not `CRESCENT`), so a query
must match both forms. `q=rumbellow crescent` builds `"RUMBELLOW"* AND ("CRESCENT"* OR "CRES"*)`
and matches `RUMBELLOW CRES AJAX ON`. A naive `"CRESCENT"*` matches nothing.

The OR group also protects street *names*: `normalizeStreetDirection('WEST')` is `W`, so replacing
rather than expanding would turn a search for "West St" into "W St".

**Civic stripping.** `suggest_text` holds no civic number, so the civic is removed before matching:
`250 main st tor` searches `"MAIN"* AND "ST"* AND "TOR"*`. Exactly one leading token is dropped,
so `250 16th ave` keeps `16TH`.

## Case 14: Candidate window ordering

**Context:** `/api/search` takes a candidate window from FTS5 (`ODA_SUGGEST_CANDIDATE_WINDOW`, default
50) and then scores it in JS. Because the window is a *truncation*, whatever orders it decides what
scoring is allowed to see. Ordering it by bm25 alone was wrong.

**Reproduction** (Ontario, streets named Main St in Toronto/Stratford/Stouffville/Steeles/St
Catharines/Ottawa), query `main st`:

```
ORDER BY bm25 ASC LIMIT 5            <- the old ordering
  MAIN ST STOUFFVILLE ON    bm25=-0.0000  n=15
  MAIN ST STRATFORD ON      bm25=-0.0000  n=12
  MAIN ST STEELES ON        bm25=-0.0000  n=8
  MAIN ST ST CATHARINES ON  bm25=-0.0000  n=30
  MAIN ST E STOUFFVILLE ON  bm25=-0.0000  n=5
```

**Main St Toronto (n=250) does not appear at all.** Two mechanisms:

1. **bm25 gives no signal here.** Every matching row contains both `MAIN` and `ST`, so IDF
   collapses and every row scores `-0.0000`. Ordering by a constant is ordering arbitrarily.
2. **Prefix terms inflate term frequency.** `"ST"*` matches the token `ST` *and* `STOUFFVILLE`,
   `STRATFORD`, `STEELES`, `ST CATHARINES` — cities whose names merely begin with "st".

bm25 is a document ranker; these are 4-token strings. It is used here as a *matcher*, and ranking
belongs in JS where prefix quality, popularity and proximity live.

**Expected ordering** — prefix match, then proximity when biased, then popularity, with bm25 last
as a tie-break only:

```
main st                              main st + locationBias=43.65,-79.38
  MAIN ST TORONTO ON     n=250         MAIN ST TORONTO ON     n=250
  MAIN ST E TORONTO ON   n=83          MAIN ST E TORONTO ON   n=83
  MAIN ST W TORONTO ON   n=62          MAIN ST W TORONTO ON   n=62
  MAIN ST OTTAWA ON      n=40          MAIN ST STEELES ON     n=8    <- nearby beats bigger
  MAIN ST ST CATHARINES  n=30          MAIN ST E STEELES ON   n=2
```

Proximity must be part of the **SQL** ordering, not applied only in JS afterwards: applied after
the window, it can only reshuffle rows bm25 already admitted, so a nearby street cut at position 79
of 348 can never be recovered. `locationBias` stays a soft signal — it reorders the window, it
never filters (that is `locationRestriction`).

Asserted in `test/oda-suggest.test.ts` ("candidate window ordering"). Those tests assert the
generated SQL, because the `LIMIT` executes in SQLite and the D1 mock cannot run it — the
behaviour above was verified against a real database.
