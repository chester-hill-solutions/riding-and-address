# Municipal and sub-municipal geography — an address's full political address

Source: source archaeology and a working acquisition pipeline, 2026-10-19. Grounded in
`src/arcgis.ts`, `src/geo-sources.ts`, `src/geo-normalize.ts`, `src/geo-datasets.ts`,
`src/datasets.ts`, `scripts/acquire-geo-datasets.ts`, `scripts/acquire-electoral-geo.py`.

Goal: turn CanCoder from "which riding is this address in" into "what is every
jurisdiction this address belongs to" — municipality, metropolitan area, census division,
riding, ward and polling division — with each level's vintage stated in the response.

---

## Context

CanCoder already answers the electoral question well. The layers below it are where the
product is thin, and they are thin in a specific way: each one is a separate official
publication, on a separate host, with its own licence, its own field names, and its own
vintage. A rider lives in one of those layers at any time; the polling division is the
tightest unit a campaign can knock.

**Why this is worth doing now.**

- The tier is a *product*, not a dataset. "Address → polling division" has no incumbent
  API. Real-estate, retail site selection and insurance want the municipality and the
  metropolitan area; campaigns want the polling division; nobody should have to ask for
  both to get one.
- GoCanvass already consumes CanCoder as its geocoder. If CanCoder also answers with the
  polling division, GoCanvass gets assignable turf for free and CanCoder gets a
  distribution channel and a reason to exist beyond "riding lookup".
- The acquisition is *ours*. Nobody else has assembled the census hierarchy, the
  electoral layers and the polling divisions into one consistent, versioned, self-serve
  surface. That is a labour moat, the same shape as PoliCorner's 551 curated feeds.

**Ground rules, for every wave.**

- **Official sources only, and we host them ourselves.** No runtime dependency on a
  third party's bucket. Every dataset is copied into CanCoder's own R2 at import time.
- **Attribution travels with the data.** The licence and the attribution string are
  recorded per dataset in `data/geo/PROVENANCE.json` and per layer in
  `src/geo-sources.ts`. A dataset with no recorded licence is not shipped.
- **The vintage is part of the answer.** A polling division number is unique only inside
  (electoral district, election). A census subdivision boundary is a 2021 or 2016 vintage.
  Every response states which vintage answered, and no response implies a currency it
  does not have.
- **Bilingual by construction.** The English census layers carry no French names; the
  French twin service is joined on the census unit identifier and the French name is
  attached. A Quebec unit with no French name is a bug, not a gap.

---

## Source findings

These are the results of the archaeology, and they are the reason the plan is shaped the
way it is. Everything here was verified against the live services, not read from a
readme.

| Source | Host | Wall? | What it carries |
|---|---|---|---|
| Government of Canada shared ArcGIS | `maps-cartes.services.geo.ca/server_serveur/rest/services` | **No** | 2016 census subdivisions + divisions; federal polling divisions for 2015, 2019, 2021, 2025; federal electoral districts 2019, 2023, 2025 |
| Elections Canada bulk archives | `www.elections.ca/res/cir/mapsCorner/vector/` | **No** | Current-election shapefile zips: PD 2025 (95 MB), FED 2025, APD 2025 |
| Statistics Canada 2021 census | `geo.statcan.gc.ca/geo_wa/rest/services/2021/...` | **Yes** | 2021 census metropolitan areas, 2021 census subdivisions, 2021 census divisions |
| Statistics Canada bulk downloads | `www12.statcan.gc.ca/...` | **Yes, hard** | Answers 403 "Security Check" to every client, including a full browser header set |
| GeoGratis FTP | `ftp.geogratis.gc.ca/pub/nrcan_rncan/vector/electoral/<year>/` | **No** | `pd308.<year>.zip` — federal polling division boundaries for 2000, 2004, 2006, 2008, 2011, 2015, under the Elections Canada unrestricted-use licence |
| Open Government Portal | `open.canada.ca/data/api/action/package_show?id=<uuid>` | **No** | Machine-readable dataset → resource index. Use this to discover; never scrape the HTML pages |

**The three traps, each of which cost time to find.**

1. **`geometryPrecision=7` makes every query fail.** The service answers 500 for that
   parameter in combination with `outSR`. `outSR=4326` is mandatory (the native projection
   is Lambert), so the precision parameter is simply omitted, and the rounding that reduces
   the payload is applied downstream instead.
2. **Page size is a reliability knob, not a throughput knob.** At 1,000 features per
   request the service returns 504 after 60 seconds. At 50 it returns in seconds. The
   acquisition script pages at 50 and pauses a second between pages.
3. **Statistics Canada blocks the client IP after sustained use.** The symptom is a 403
   (sometimes a disguised 500) on the *data* paths while the service root still answers
   200. It recovers after a cooldown of unknown length. This is why the shared Government
   of Canada host is the primary source and Statistics Canada's own host is the fallback
   for the 2021 census tiers only.

**Field naming is per-vintage, which is why a layer spec is per-vintage.**

| Layer | English fields | French fields | Join key |
|---|---|---|---|
| CSD 2016 | `CSDUID`, `CSDNAME`, `CSDTYPE`, `PRUID`, `CDUID`, `CDNAME`, `CCSUID`, `ERUID`, `CMAUID`, `CMANAME` | `SDRIDU`, `SDRNOM`, `DRIDU`, `DRNOM`, `RÉIDU`, `RÉNOM`, `RMRIDU`, `RMRNOM` | `CSDUID` |
| PD 2025 | `FED_NUM`, `PD_NUM`, `PD_NBR_SFX`, `PD_NUM_SFX_CO`, `PD_TYPE`, `ADV_POLL_NUM` | same | `FED_NUM` |
| PD 2021 | `FED_NUM`, `PD_NUM`, `PD_NBR_SFX`, `PD_NUM_SFX_CO`, `PD_TYPE`, `ADV_POLL_NBR` | same | `FED_NUM` |
| PD 2019 | `FEDNUM`, `PDNUM`, `PDNUMSFX`, `PDTYPE`, `ADVPOLLNUM`, `POLLNAME` | same | `FED_NUM` |
| PD 2015 | `fed_num`, `pd_num`, `pd_nbr_sfx`, `pd_type`, `adv_poll`, `poll_name` | same | `FED_NUM` |

Note the accented French field names (`RÉIDU`, `RÉNOM`) and the four different casing
conventions. `src/geo-sources.ts` carries a field map per layer precisely so that none of
this leaks into the serving code.

**One more fact that makes the whole thing simpler.** Statistics Canada's `PRUID` and
Elections Canada's `FED_NUM` prefix use the same province digits — 24=QC, 35=ON, 46=MB,
47=SK, 48=AB, 59=BC, 10=NL, 11=PE, 12=NS, 13=NB, 60=YT, 61=NT, 62=NU. One map serves
both sources, so `PROV_TERR` is derived rather than copied, and it is derived identically
for a census subdivision and a polling division.

**Measured sizes.** All four acquired during this work, from the official sources.

| Dataset | Features | Written size | Source used |
|---|---|---|---|
| Federal polling divisions 2025 | 71,687 | 229 MB | Elections Canada bulk archive |
| Federal electoral districts 2025 | 352 | 23 MB | Elections Canada bulk archive |
| Census subdivisions 2016 | 5,162 | 114 MB | Government of Canada shared ArcGIS |
| Census divisions 2016 | 293 | 27 MB | Government of Canada shared ArcGIS |

The census subdivision layer came back with a French name on **100% of the 5,162 units**,
which is the test that the French join works.

These are large. The R2 + per-isolate LRU path cannot hold the polling-division layer in
memory, which makes the D1 spatial index mandatory for this tier rather than optional —
see Wave 2.

**Cross-check against what CanCoder already serves.** The newly acquired 2025 federal
electoral districts agree exactly with the live API's 2024 layer — Carleton University →
`King—Vaughan` / `FED_NUM 35047`, downtown Toronto → `Spadina—Harbourfront` / `35100`,
McGill → `Ville-Marie—Le Sud-Ouest—Île-des-Soeurs` / `24077` — and the polling division
layer's `FED_NUM` references line up with the same map. The federal tier does not need
re-acquiring; the polling division tier is new.

---

## Wave 0 — Foundations  *(done, small)*

1. `src/arcgis.ts` — an ArcGIS REST client that reads a MapServer layer as GeoJSON:
   paginated with `resultOffset`, honouring `exceededTransferLimit`; a browser
   `User-Agent` on every request; bounded exponential backoff that treats 403 and 5xx as
   retryable; a feature cap; a per-page pause.  *(`test/arcgis.test.ts`, 15 cases.)*
2. `src/geo-sources.ts` — the upstream registry: every source, every layer, every
   vintage, the field maps, the join keys, the licence and the per-layer attribution.
   *(`test/geo-sources.test.ts`.)*
3. `src/geo-normalize.ts` — the pure normalization: source attributes → the CanCoder
   property contract, `PROV_TERR` derived from `PRUID`/`FED_NUM`, `ENGLISH_NAME` derived
   from the level's name property, the French join, and coordinate rounding.
   *(`test/geo-normalize.test.ts`.)*
4. `src/geo-datasets.ts` — the serving-side registry: code, R2 key, display name, year,
   route, aliases, level, status. Separate from `PROVINCIAL_DATASETS` because a national
   level has no province and its aliases must not feed the `PROV_TERR` route map.
5. `src/datasets.ts` — the geo registry wired into `isLookupPath`, `pickDataset`,
   `getAllDatasetKeys`, `getLiveWarmTargets`, `getRouteForR2Key` and
   `checkDatasetsFromSource`. A geo dataset that is `registered` but not yet in R2 does
   not fail health, because only `live` datasets are required.
6. `src/routes.ts` + `src/docs.ts` — the routes and their OpenAPI entries, under a
   `Municipal & Sub-Municipal` tag. The docs gate asserts the spec and the route table
   agree in both directions, so the route and the spec were written together.
7. `src/lookup-handler.ts` — `datasetMetaForPath` now resolves the geo levels, so the
   `dataset` response field and the dataset pin both name the right vintage.
8. `src/dataset-source.ts` — `DatasetNotFoundError`, marked non-retriable, so a
   registered-but-unacquired level answers 404 `DATASET_UNAVAILABLE` rather than a 500.
   "We do not serve this level yet" is a different answer from "the lookup is broken".

**Done when.** `bun run validate` is green and `npm run acquire:geo -- --help` prints
the usage. *(Both true.)*

**Risk.** Low. The registry is data; the changes to the existing riding paths are
additive and the existing 1,043 tests still pass.

---

## Wave 1 — Acquire and publish the census tiers  *(medium)*

1. Run the acquisition against the shared Government of Canada host:
   `npm run acquire:geo -- --source goc-shared-arcgis --level csd --level cd --execute`.
   Write to `data/geo/<r2Key>`, with `data/geo/PROVENANCE.json` recording the source, the
   licence, the attribution, the feature count and the SHA-256 of every dataset written.
2. Acquire the 2021 census metropolitan areas from Statistics Canada's own host:
   `npm run acquire:geo -- --source statcan-2021-census --level cma --execute`. This is
   the one level the shared host does not carry, so it is the one that needs the
   rate-limited host. Run it in a patient, resumable pass: the script skips a dataset
   whose output file already exists, so a run that trips the block can simply be repeated
   later.
3. Upload to R2: `npm run upload:r2-datasets -- --remote`. The upload script now searches
   `data/geo` as well as `data/ridings` and iterates every dataset key.
4. Flip `status` from `registered` to `live` in `src/geo-datasets.ts` for the datasets
   that are in R2, one commit per dataset, so a bad upload is a one-line revert.

**Done when.** `GET /api/csd?lat=43.65&lon=-79.38` returns the census subdivision
containing that point, with `dataset.year` naming the vintage and `properties` carrying
`CSDUID`, `CSDNAME`, `CSDTYPE`, `CSDNAME_FR` and `PROV_TERR`. The same for `/api/cd` and
`/api/cma`.

**Risk.** Medium, and the risk is the source, not the code. The 2021 census metropolitan
areas need a host that blocks sustained use, so that one acquisition may need several
attempts over several days. Mitigation: the 2016 census subdivisions carry `CMAUID` and
`CMANAME` on every feature, so a census metropolitan area can be derived from the census
subdivision layer by dissolving on `CMAUID` if the 2021 host stays hostile. Deriving is a
fallback, not the plan.

---

## Wave 2 — The polling division at scale  *(large)*

This is the commercially interesting layer and the one with the real engineering.

1. **Import into D1, not into the LRU.** The 2025 layer is 71,687 polygons across 239 MB.
   The R2 + per-isolate LRU path holds a whole dataset in memory per isolate; that is
   fine for 343 ridings and impossible for 71,687 polling divisions. The D1 spatial index
   (`spatial_features` + `spatial_rtree`) is already the production path — it is
   `SPATIAL_DB_ENABLED: "true"` in `portal/wrangler.jsonc` — and it is already
   dataset-keyed, so it already generalises. The work is a bulk import that is
   idempotent, resumable, and metered.
2. **Import in the existing batch shape.** `src/spatial.ts` already has
   `chunkFeaturesByByteSize`, `shrinkFeatureGeometry` and the R-tree insert. Write a
   `scripts/import-geo-spatial.ts` that reads `data/geo/<r2Key>`, allocates the per-dataset
   `rid` range, and inserts in chunks. D1 writes are metered, so the import needs a cost
   ceiling and a resume point.
3. **Simplify on the way in.** `shrinkFeatureGeometry` already decimates features that
   exceed D1's per-value limit, but a 239 MB layer is mostly *many* features rather than a
   few huge ones. Decimating the voting division polygons to the precision the
   point-in-polygon test needs (5 decimals, ~1 m) before the import cuts both the
   write volume and the query cost.
4. **Decide what a 500 is not.** A polling division is 300–800 voters. 71,687 of them is
   the whole country. A Canadian address can be in a riding, a census subdivision, a
   census division, a metropolitan area and a polling division, and the response should
   say so without pretending the polling division is precise to the doorstep.

**Done when.** `GET /api/pd?lat=43.9&lon=-79.7` returns the polling division containing
that point, with `FED_NUM`, `PD_NUM_SFX_CO` and `PROV_TERR` in `properties`, answered
from D1 in under 100 ms, with the R2 layer absent from the request path.

**Risk.** High, in two places. D1 write cost is the unknown — 71,687 rows is a lot for
D1, and the bill has to be modelled before the import runs at full size. And the R-tree
query has to stay fast with 71,687 entries; the `rid` allocation scheme is per-dataset
and already correct, but the query plan has to be measured, not assumed.

---

## Wave 3 — The historical submunicipal archive  *(medium)*

Nobody offers "which polling division was this address in, in 2015". That is a
research product, a redistricting-analysis product, and an explain-the-past-election
product, and it is the same machinery as the current layer.

1. Acquire the 2015, 2019 and 2021 federal polling divisions from the shared Government of
   Canada host: `npm run acquire:geo -- --source goc-shared-arcgis --level pd2015 --level
   pd2019 --level pd2021 --execute`.
2. Acquire the older federal polling divisions from GeoGratis, which carries 2000, 2004,
   2006, 2008, 2011 and 2015 as `pd308.<year>.zip` under the Elections Canada
   unrestricted-use licence. These are shapefile archives, so they are read with geopandas
   by `scripts/acquire-electoral-geo.py`, following the pattern
   `scripts/acquire-provincial-ridings.py` already sets.
3. Serve each vintage on its own route: `/api/pd/2015`, `/api/pd/2019`, `/api/pd/2021`,
   with `/api/pd` as the current one. The dataset pin mechanism already distinguishes
   vintages; Wave 5 makes it selectable.
4. Record the licence per vintage. The GeoGratis archives carry the Elections Canada
   unrestricted-use licence (`Licence_E.txt` in each directory), which is *not* the same
   document as the Open Government Licence and has to be read, not assumed.

**Done when.** `/api/pd/2015` answers, and the difference between the 2015 and 2025
polling division for a given address is a single, honest, documented answer.

**Risk.** Medium. The older archives have a different schema and a different licence
document, and the 2015 and 2019 field names are lower case and unseparated respectively —
the field map absorbs that, but each vintage needs its own verified map.

---

## Wave 4 — The chained lookup  *(medium)*

The product is one call that answers every level, not seven routes.

1. Add a `GET /api/address` route — or extend `/api/combined` with optional
   `municipality_data`, `metro_data` and `submunicipal_data` blocks — that runs the
   levels in one request and returns each level's result with its own vintage.
2. Reuse the existing expansion pattern in `src/lookup-expansion.ts`. The
   `fetchProvinceData` / `needsProvince` fan-out is exactly the shape; the province block
   is the level-1 case of a level-n fan-out.
3. Keep it opt-in and metered. A caller that wants only the riding should not be billed
   for five point-in-polygon passes, and the response should not carry five blocks the
   caller did not ask for.
4. Cache on the level set, not on the level. The lookup cache key in `src/cache.ts`
   already includes the dataset path; the chained form needs a key that covers the whole
   requested level set, or the cache will serve a partial answer to a full request.

**Done when.** One request returns the federal riding, the provincial riding, the census
subdivision, the census metropolitan area and the federal polling division for an
address, each block naming its own dataset and vintage, and the billing meter counts it
as one billable unit.

**Risk.** Medium. The fan-out multiplies the D1 queries per request, and the lookup
timeout budget is shared with the geocoder. The timeout config in `src/config.ts` needs
an explicit budget per level, not one number for the whole request.

---

## Wave 5 — Dataset pins per level  *(small)*

The pin currently hard-fails unless it matches the vintage the route serves, which is the
right behaviour for a single-level route and the wrong behaviour for a chained one.

1. Extend the pin to name a level and a vintage: `?dataset=pd:2015`, alongside the
   existing single-level form.
2. Keep the hard-fail. An unavailable vintage is a 404 `DATASET_UNAVAILABLE`, not a
   silent fallback to the current one. A caller that asked for 2015 and got 2025 has been
   lied to.
3. State the resolved vintage in the response for every level, not just the primary one.

**Done when.** `GET /api/address?dataset=pd:2015` answers with the 2015 polling division
and says so, and `?dataset=pd:1999` is a clean 404.

**Risk.** Low. The pin is a pure guard today; making it a selector is a change to
`src/lookup-handler.ts` and the cache key, and both are already under test.

---

## Wave 6 — The municipal ward long tail  *(large, deferred)*

This is where the labour moat lives and it is deliberately last.

1. Fifteen municipalities, each with its own open-data portal, its own schema, its own
   licence and its own redistricting cycle. Toronto's wards changed in 2018, 2022, 2023,
   2024 and 2025; Vancouver's electoral districts changed in 2008 and 2011; Montréal
   publishes boroughs and electoral sections; Calgary, Edmonton, Ottawa, Winnipeg,
   Mississauga, Sudbury, Québec City, London, Hamilton, Lethbridge, Kelowna and
   Vancouver's local areas each publish their own.
2. Each municipality is a separate acquisition, a separate normalization and a separate
   schema. Write the first two — Toronto and Montréal — as a worked example, and only then
   decide whether the rest is worth automating.
3. The reference implementation already exists in Poliwave's repository
   (`static/shapefiles/ca/{tor,mtl,cgy,edm,ott,wpg,van,...}`), unnormalized and
   un-licenced per layer. Use it as a map of what exists; re-source from each municipal
   portal rather than copying, so the licence is ours to honour.
4. The cross-vintage problem is real and is the reason this is last: a ward number in
   2018 and a ward number in 2025 are different units, and the dataset has to say which.

**Done when.** `/api/ward?lat=…&lon=…&city=Toronto` answers with the ward, its
`AREA_SHORT_CODE`, and the vintage of the ward map that answered.

**Risk.** High, and the risk is the long tail itself: fifteen bespoke pipelines is a
quarter of a year, and a buyer for a single city's ward map is worth very little. The
right trigger is a named customer, not a hunch.

---

## Wave 7 — Product surface  *(medium)*

1. **Pricing.** Every level is one billable unit of the same metered call today. A
   polling-division lookup is worth more than a riding lookup — it is the unit a campaign
   actually canvasses — so the meter needs per-level unit prices, not one
   `$0.005`/unit. `portal/app/lib/pricing.ts` and the billing-invariant gate are where
   that lands.
2. **Docs.** `docs/DATASET_CHANGELOG.md` gets a row per dataset with its vintage and its
   licence. `docs/README.md` gets a guide. The OpenAPI spec already documents the routes.
3. **MCP.** `src/mcp.ts` exposes a `lookup_riding` tool with a `DATASETS` enum; the new
   levels join it, and a `lookup_jurisdiction` tool that returns every level at once is
   the better agent-facing surface.
4. **GoCanvass.** GoCanvass already calls CanCoder as its geocoder. Ask it for the
   polling division and it gets assignable turf that matches the actual canvass target.
   This is the internal demand that justifies the tier.
5. **The embed widget.** The browser widget resolves through `/api/combined`; it should
   be able to show the municipality and the polling division, not just the riding.

**Done when.** A customer can buy a polling-division lookup on the pricing page, and
GoCanvass asks for one without a bespoke integration.

**Risk.** Medium. Pricing is the sensitive part: raising the metered price on existing
riding lookups to pay for the new tiers would be a hostile change to a published price
list, so the new levels need their own unit price.

---

## Wave 8 — Operations  *(medium)*

1. **Refresh cadence.** The census layers refresh on a five-year cycle; the electoral
   layers on a redistribution cycle; the polling divisions on an election cycle; the
   municipal wards on a municipal cycle. Four clocks. A single refresh job with a single
   schedule would be wrong for all of them. Each dataset needs its own cadence, its own
   check, and its own "this is stale" signal.
2. **Staleness in the response.** A consumer needs to know whether the answer is current.
   The `dataset` block carries the vintage; add a `staleness` note where a vintage is
   known to be superseded but the replacement is not yet acquired.
3. **Provenance.** `data/geo/PROVENANCE.json` records the licence, the attribution, the
   feature count and the SHA-256 for every dataset. Publish it, so a customer can check
   what they are being served.
4. **Monitoring.** The health route already head-checks every dataset key. Add the
   geo datasets, and alert on a `live` dataset going missing.

**Done when.** A dataset going stale is visible in the response and in the health route
before a customer notices.

**Risk.** Low, but it is the wave that gets skipped, and skipping it is how a data
product rots quietly.

---

## Sequencing summary

| Wave | Candidate | Size | Behaviour change | Depends on |
|---|---|---|---|---|
| 0 | Foundations | done | new routes exist, 404 until the data lands | — |
| 1 | Census tiers | medium | `/api/csd`, `/api/cd`, `/api/cma` answer | 0 |
| 2 | Polling division at scale | large | `/api/pd` answers from D1 | 0, 1 |
| 3 | Historical archive | medium | `/api/pd/{2015,2019,2021}` answer | 2 |
| 4 | Chained lookup | medium | one request, every level | 1, 2 |
| 5 | Per-level pins | small | `?dataset=pd:2015` selects a vintage | 4 |
| 6 | Municipal ward long tail | large | `/api/ward` answers | 1, 2, 7 |
| 7 | Product surface | medium | per-level pricing, MCP, GoCanvass | 1, 2 |
| 8 | Operations | medium | refresh, staleness, provenance | 1, 2, 3 |

The order is deliberate: the cheap, high-confidence tier (the census hierarchy) lands
first and proves the pipeline; the expensive, high-value tier (the polling division)
lands second and is the one worth the D1 engineering; the chained surface and the pricing
follow the two; the long tail is last because it is a quarter of a year and one named
customer away from being worth it.

---

## Acceptance

- `bun run validate` green: lint, typecheck, billing invariants, 1,043 tests.
- Every dataset served has a recorded licence and attribution.
- Every response states the vintage of every level it answers.
- Every French-named jurisdiction answers with its French name.
- No runtime dependency on a third-party bucket: every dataset is copied into CanCoder's
  own R2 at import time.

## Open questions

1. **Does the 2021 census metropolitan area earn its own route, or is it a field on the
   census subdivision?** The 2016 census subdivisions already carry `CMAUID` and
   `CMANAME`. A separate `/api/cma` with 156 polygons is a nicer answer, but a second
   point-in-polygon for a field we already have is not obviously worth it.
2. **What is the unit price of a polling-division lookup relative to a riding lookup?**
   The right answer depends on who is actually buying it, and the only way to find out is
   to sell one.
3. **Does the historical archive need the pre-2000 federal ridings too?** The 1896–2026
   series exists but is Election Atlas geometry under a permission that is not ours. The
   federal *polling* divisions before 2000 do not exist at all.
4. **Should the chained lookup be one billable unit or one per level?** One unit is
   friendlier and simpler; per level is honest about the work. Worth deciding with a
   customer rather than alone.
5. **Who else is assembling this?** If a competitor ships the same chained surface from
   the same official sources, the labour moat evaporates and the answer is a moat
   somewhere else — probably the refresh cadence and the staleness guarantees, which are
   operations rather than data.
