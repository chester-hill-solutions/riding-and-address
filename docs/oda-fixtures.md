# ODA Fixture Acceptance Examples

These fixture cases define expected behavior. Tests in `test/oda-geocoding.test.ts` and `test/canada-post-format.test.ts` assert against these examples.

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
