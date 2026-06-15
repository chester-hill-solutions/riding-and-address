# Epic: Expand Provincial Riding Coverage (RIDING-EXP-001)

## Goal
Expand riding-and-address API coverage from 3 datasets (Federal, Ontario, Quebec) to 10+ provinces and territories with open electoral boundary data.

## Success Criteria
- [ ] Each province with available open data has a dedicated `/api/{code}` endpoint
- [ ] Provincial data is sourced from official electoral boundary commissions
- [ ] All datasets use consistent naming conventions and are stored in R2
- [ ] API documentation is updated to reflect new endpoints
- [ ] Batch processing and combined endpoints support all new provinces
- [ ] Cache warming covers all new datasets

## Current State
| Code | Province | Status | Dataset | Year |
|------|----------|--------|---------|------|
| — | Federal | ✅ LIVE | `federalridings-2024.geojson` | 2024 |
| on | Ontario | ✅ LIVE | `ontarioridings-2022.geojson` | 2022 |
| qc | Quebec | ✅ LIVE | `quebecridings-2025.geojson` | 2025 |

## Target State
| Code | Province/Territory | Status | Priority | Data Source |
|------|-------------------|--------|----------|-------------|
| bc | British Columbia | 🔲 BACKLOG | P1 | Elections BC |
| ab | Alberta | 🔲 BACKLOG | P1 | Elections Alberta |
| ns | Nova Scotia | 🔲 BACKLOG | P1 | Elections Nova Scotia |
| nb | New Brunswick | 🔲 BACKLOG | P1 | Elections New Brunswick |
| mb | Manitoba | 🔲 BACKLOG | P2 | Elections Manitoba |
| sk | Saskatchewan | 🔲 BACKLOG | P2 | Elections Saskatchewan |
| nl | Newfoundland and Labrador | 🔲 BACKLOG | P2 | Elections NL |
| pe | Prince Edward Island | 🔲 BACKLOG | P2 | Elections PEI |
| nt | Northwest Territories | 🔲 BACKLOG | P3 | Elections NWT |
| nu | Nunavut | 🔲 BACKLOG | P3 | Elections Nunavut |
| yt | Yukon | 🔲 BACKLOG | P3 | Elections Yukon |

---

## Story 1: Core Infrastructure for Provincial Expansion (RIDING-EXP-001-S1)
**Effort:** 2 days
**Dependencies:** None

### Tickets

#### Ticket S1-T1: Refactor `pickDataset` to support province registry pattern
**Effort:** 0.5 day
**File:** `src/utils.ts`

Convert `pickDataset` from hardcoded if-else to a registry-driven lookup. Create a `PROVINCIAL_DATASETS` constant array that declares each province's code, R2 key, and metadata. This eliminates the need to touch routing logic every time a province is added.

```typescript
export const PROVINCIAL_DATASETS = [
  { code: "on", r2Key: "ontarioridings-2022.geojson", name: "Ontario", year: 2022 },
  { code: "qc", r2Key: "quebecridings-2025.geojson", name: "Quebec", year: 2025 },
  // ... new entries added here
] as const;
```

Update `pickDataset` to search this array. Update `PROV_TERR_TO_PROVINCE_PATH` to be generated from the same source of truth.

#### Ticket S1-T2: Refactor `PROV_TERR_TO_PROVINCE_PATH` for dynamic expansion
**Effort:** 0.5 day
**File:** `src/utils.ts`

Replace the hardcoded `PROV_TERR_TO_PROVINCE_PATH` record with a build-time or runtime generator that produces the full set of aliases (code, full name, common abbreviations) from `PROVINCIAL_DATASETS`. This ensures that when `include_province=true` is used on a federal lookup, the system can resolve provincial data for any province in the registry.

#### Ticket S1-T3: Update OpenAPI spec to support provincial endpoint registry
**Effort:** 0.5 day
**File:** `src/docs.ts`

Modify `createOpenAPISpec` to dynamically generate the `/api/{code}` path entries from `PROVINCIAL_DATASETS` instead of hardcoding `/api/on`, `/api/qc`, and `/api/combined`. This keeps the API documentation in sync with the code.

#### Ticket S1-T4: Add provincial endpoint smoke tests
**Effort:** 0.5 day
**File:** `test/provincial-routes.test.ts` (new)

Create a test suite that iterates over `PROVINCIAL_DATASETS` and verifies that each declared endpoint returns a valid response (or a 404 if the dataset is not yet uploaded). This prevents regressions when new provinces are added.

---

## Story 2: British Columbia & Alberta (RIDING-EXP-001-S2)
**Effort:** 3 days
**Dependencies:** S1 (Core Infrastructure)

### Context
BC and Alberta are the highest-priority provinces after ON/QC. Both have well-maintained electoral boundary commissions that publish shapefiles. The 2024 BC provincial election used boundaries from the 2022 redistribution; Alberta's current boundaries are from 2022.

### Data Sources
- **BC:** Elections BC — https://www.elections.bc.ca/ (Shapefiles available in "Open Data" section)
- **AB:** Elections Alberta — https://www.elections.ab.ca/ (Boundary files in "Resources" → "GIS Data")

### Tickets

#### Ticket S2-T1: Source and convert BC provincial electoral boundaries
**Effort:** 1 day
**Deliverable:** `bcridings-2022.geojson` (or current year) uploaded to R2

1. Locate the official BC electoral boundaries shapefile/GeoJSON from Elections BC
2. Convert to GeoJSON FeatureCollection if needed
3. Verify coordinate reference system is WGS84 (EPSG:4326)
4. Validate that all features have a `name` or `riding` property that `ridingNameFromProperties` can resolve
5. Add `PROV_TERR: "BC"` property to each feature for `include_province` resolution
6. Upload to R2 as `bcridings-2022.geojson` (or appropriate year)
7. Test with a sample of BC addresses: Vancouver, Victoria, Kelowna

#### Ticket S2-T2: Source and convert Alberta provincial electoral boundaries
**Effort:** 1 day
**Deliverable:** `abridings-2022.geojson` (or current year) uploaded to R2

Same workflow as S2-T1 for Alberta. Test with Calgary, Edmonton, Red Deer.

#### Ticket S2-T3: Register BC and Alberta in provincial dataset registry
**Effort:** 0.5 day
**File:** `src/utils.ts`

Add BC and Alberta entries to `PROVINCIAL_DATASETS`. Verify `pickDataset('/api/bc')` and `pickDataset('/api/ab')` return correct R2 keys. Verify `PROV_TERR_TO_PROVINCE_PATH` resolves `BC`, `AB`, `BRITISH COLUMBIA`, `ALBERTA` correctly.

#### Ticket S2-T4: Update API docs for BC and Alberta endpoints
**Effort:** 0.5 day
**File:** `src/docs.ts`, `README.md`

Add `/api/bc` and `/api/ab` to the OpenAPI spec, the README endpoint list, and the landing page examples.

---

## Story 3: Atlantic Provinces (RIDING-EXP-001-S3)
**Effort:** 3 days
**Dependencies:** S1 (Core Infrastructure)

### Context
Nova Scotia, New Brunswick, Newfoundland and Labrador, and PEI all have distinct electoral boundary commissions. The Atlantic provinces have smaller populations but the data is generally available. NS and NB have the most accessible open data portals.

### Data Sources
- **NS:** Elections Nova Scotia — https://electionsnovascotia.ca/ (GIS data in "Resources")
- **NB:** Elections New Brunswick — https://www.electionsnb.ca/ (GIS data available)
- **NL:** Elections Newfoundland and Labrador — https://www.elections.gov.nl.ca/
- **PE:** Elections PEI — https://www.electionspei.ca/

### Tickets

#### Ticket S3-T1: Source and convert Nova Scotia electoral boundaries
**Effort:** 0.75 day
**Deliverable:** `nsridings-2022.geojson` (or current year) in R2

Locate NS shapefile, convert, validate, upload. Test with Halifax, Sydney, Truro.

#### Ticket S3-T2: Source and convert New Brunswick electoral boundaries
**Effort:** 0.75 day
**Deliverable:** `nbridings-2022.geojson` (or current year) in R2

Locate NB shapefile, convert, validate, upload. Test with Fredericton, Moncton, Saint John.

#### Ticket S3-T3: Source and convert Newfoundland and Labrador electoral boundaries
**Effort:** 0.75 day
**Deliverable:** `nlridings-2022.geojson` (or current year) in R2

Locate NL shapefile. Note: NL may have district-level boundaries rather than "riding" terminology. Test with St. John's, Corner Brook.

#### Ticket S3-T4: Source and convert PEI electoral boundaries
**Effort:** 0.75 day
**Deliverable:** `peridings-2022.geojson` (or current year) in R2

Locate PEI shapefile. Note: PEI has only 27 districts. Test with Charlottetown, Summerside.

#### Ticket S3-T5: Register all Atlantic provinces in dataset registry
**Effort:** 0.5 day
**File:** `src/utils.ts`

Add NS, NB, NL, PE to `PROVINCIAL_DATASETS` and verify all paths resolve.

---

## Story 4: Prairies (RIDING-EXP-001-S4)
**Effort:** 2 days
**Dependencies:** S1 (Core Infrastructure)

### Context
Manitoba and Saskatchewan have electoral boundary commissions. Both provinces are important for federal campaigns and the data is generally available through their respective elections agencies.

### Data Sources
- **MB:** Elections Manitoba — https://www.electionsmanitoba.ca/
- **SK:** Elections Saskatchewan — https://www.elections.sk.ca/

### Tickets

#### Ticket S4-T1: Source and convert Manitoba electoral boundaries
**Effort:** 0.75 day
**Deliverable:** `mbridings-2022.geojson` (or current year) in R2

Locate MB shapefile, convert, validate, upload. Test with Winnipeg, Brandon.

#### Ticket S4-T2: Source and convert Saskatchewan electoral boundaries
**Effort:** 0.75 day
**Deliverable:** `skridings-2022.geojson` (or current year) in R2

Locate SK shapefile, convert, validate, upload. Test with Regina, Saskatoon.

#### Ticket S4-T3: Register Manitoba and Saskatchewan in dataset registry
**Effort:** 0.5 day
**File:** `src/utils.ts`

Add MB, SK to `PROVINCIAL_DATASETS`.

---

## Story 5: Territories (RIDING-EXP-001-S5)
**Effort:** 2 days
**Dependencies:** S1 (Core Infrastructure)

### Context
Northwest Territories, Nunavut, and Yukon each have their own electoral systems. NWT and Nunavut use consensus government rather than party systems, but still have electoral districts. Data is available but may be less standardized.

### Data Sources
- **NT:** Elections NWT — https://www.electionsnwt.ca/
- **NU:** Elections Nunavut — https://www.electionsnunavut.ca/
- **YT:** Elections Yukon — https://www.electionsyukon.ca/

### Tickets

#### Ticket S5-T1: Source and convert NWT electoral boundaries
**Effort:** 0.5 day
**Deliverable:** `ntridings-2022.geojson` (or current year) in R2

Locate NWT shapefile. Test with Yellowknife.

#### Ticket S5-T2: Source and convert Nunavut electoral boundaries
**Effort:** 0.5 day
**Deliverable:** `nuridings-2022.geojson` (or current year) in R2

Locate Nunavut shapefile. Test with Iqaluit.

#### Ticket S5-T3: Source and convert Yukon electoral boundaries
**Effort:** 0.5 day
**Deliverable:** `ytridings-2022.geojson` (or current year) in R2

Locate Yukon shapefile. Test with Whitehorse.

#### Ticket S5-T4: Register territories in dataset registry
**Effort:** 0.5 day
**File:** `src/utils.ts`

Add NT, NU, YT to `PROVINCIAL_DATASETS`.

---

## Story 6: Integration & Combined Endpoint Enhancement (RIDING-EXP-001-S6)
**Effort:** 2 days
**Dependencies:** S2, S3, S4, S5 (or at least S2)

### Tickets

#### Ticket S6-T1: Update `/api/combined` to support all provinces
**Effort:** 0.5 day
**File:** `src/lookup-expansion.ts`, `src/utils.ts`

Currently `/api/combined` only resolves `include_province` for ON and QC. Extend it to iterate over all provinces in `PROVINCIAL_DATASETS` and include the matching provincial data when the federal result's `PROV_TERR` matches any province in the registry.

#### Ticket S6-T2: Update batch processing for provincial endpoints
**Effort:** 0.5 day
**File:** `src/batch.ts`

Ensure batch requests can target any provincial endpoint (`/api/bc`, `/api/ab`, etc.) and that the batch queue properly resolves the dataset for each request.

#### Ticket S6-T3: Update cache warming for all provincial datasets
**Effort:** 0.5 day
**File:** `src/cache.ts`, `src/worker.ts`

Ensure `performCacheWarming` iterates over all datasets in `PROVINCIAL_DATASETS` (plus federal) and warms each one. Currently it may only warm the federal dataset.

#### Ticket S6-T4: Add comprehensive provincial endpoint tests
**Effort:** 0.5 day
**File:** `test/` (new or existing)

Add tests that verify:
- Each provincial endpoint resolves correct riding for a known address
- `include_province=true` on federal lookup returns correct provincial data for all provinces
- `/api/combined` includes all applicable provincial data
- Batch requests work for all provincial endpoints

---

## Story 7: Documentation & Operational Readiness (RIDING-EXP-001-S7)
**Effort:** 1.5 days
**Dependencies:** S6

### Tickets

#### Ticket S7-T1: Update README with provincial coverage matrix
**Effort:** 0.5 day
**File:** `README.md`

Add a coverage matrix showing which provinces are supported, the dataset year, and the endpoint path. Update the "Data Sources" section.

#### Ticket S7-T2: Update API landing page with provincial examples
**Effort:** 0.5 day
**File:** `src/landing-page.ts`, `src/docs.ts`

Add interactive examples for each provincial endpoint to the landing page. Include a live lookup widget that lets users select a province from a dropdown.

#### Ticket S7-T3: Write operational runbook for adding a new province
**Effort:** 0.5 day
**File:** `docs/ADDING-A-PROVINCE.md` (new)

Document the exact steps to add a new province:
1. Find and download the official shapefile
2. Convert to GeoJSON (WGS84, EPSG:4326)
3. Validate feature properties (name, PROV_TERR)
4. Upload to R2 with naming convention
5. Add entry to `PROVINCIAL_DATASETS`
6. Test with known addresses
7. Update docs

---

## Implementation Order

1. **S1** — Core infrastructure (refactor to registry pattern) — 2 days
2. **S2** — BC & Alberta (highest priority, most accessible data) — 3 days
3. **S3** — Atlantic provinces — 3 days
4. **S4** — Prairies — 2 days
5. **S5** — Territories — 2 days
6. **S6** — Integration & combined endpoint — 2 days
7. **S7** — Documentation & operational readiness — 1.5 days

**Total Epic Effort:** ~15.5 days

---

## Data Availability Notes

| Province | Boundary Commission | Open Data Portal | Shapefile Availability | Notes |
|----------|---------------------|-----------------|----------------------|-------|
| BC | BC Electoral Boundaries Commission | BC Data Catalogue | ✅ Yes | Updated for 2024 election |
| AB | Alberta Electoral Boundaries Commission | Elections Alberta | ✅ Yes | 2022 boundaries |
| NS | Nova Scotia Electoral Boundaries Commission | Elections Nova Scotia | ✅ Yes | 2022 boundaries |
| NB | New Brunswick Electoral Boundaries Commission | Elections New Brunswick | ✅ Yes | 2022 boundaries |
| MB | Manitoba Electoral Boundaries Commission | Elections Manitoba | ✅ Yes | 2022 boundaries |
| SK | Saskatchewan Electoral Boundaries Commission | Elections Saskatchewan | ✅ Yes | 2022 boundaries |
| NL | Newfoundland and Labrador | Elections NL | ⚠️ Partial | May need manual request |
| PE | PEI Electoral Boundaries Commission | Elections PEI | ✅ Yes | 27 districts |
| NT | NWT Electoral Boundaries Commission | Elections NWT | ⚠️ Partial | Small population |
| NU | Nunavut | Elections Nunavut | ⚠️ Partial | Very large area, few districts |
| YT | Yukon | Elections Yukon | ⚠️ Partial | Small population |

---

*Epic created: 2026-06-15*
*Author: Hermes Agent*
*Target completion: 4-6 weeks (staged by province group)*
