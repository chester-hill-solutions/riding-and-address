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

## Case 9: Province not loaded

**Query:** `GET /api/geocode?postal=V6B1A1&province=BC` (BC not imported)

**Expected:**
- HTTP 404
- `code`: `PROVINCE_NOT_LOADED`

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
- No `province_data` unless `include_province=true` is also requested

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
