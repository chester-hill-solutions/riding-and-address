# Area-query contract — W7

**Status: decided, ready to implement (W8).** This is the W7 deliverable from
[`docs/ops/agent-first-product-plan.md`](../ops/agent-first-product-plan.md). W0
([`area-product.md`](area-product.md)) fixed *what* the records are; this fixes *how a query selects
them*. W8 implements riding-bounded search against it.

Two decisions were taken by the owner on 2026-10-16:

1. **Containment, not intersection.** A record belongs to a boundary when its **address point** falls
   inside it. There is no geometry intersection and no range/parcel reasoning.
2. **Paged, not rejected.** A query larger than one page is delivered over successive pages rather
   than refused.

## 1. Record

Unchanged from W0: one **civic address point** — civic number, street name/type/direction, unit,
city, province, postal code, WGS84 lat/lon, `dataSource` + vintage, and the riding that contains it.
No property, parcel, owner, occupant, voter or business data, and no identity resolution.

## 2. Riding identifier

A record's riding is reported as:

```json
"riding": { "datasetId": "federalridings-2024.geojson", "datasetYear": 2024,
            "id": "35079", "name": "Ottawa Centre" }
```

- `id` is the dataset's own stable field where one exists — `FED_NUM` (federal), `PR_NUM`
  (provincial) — and is `null` when the dataset has none.
- `name` is `ridingNameFromProperties()` — the same resolver the point lookup uses
  (`src/utils.ts`), so an area result and a point lookup name a riding identically.
- A **riding-bounded query accepts either** `id` or `name` for the riding, resolved against the
  requested dataset, mirroring how lookup aliases resolve.

The datasets do not share one numeric id scheme across federal and provincial sources. W8 must either
normalise one or ship with `name` as the join key; a normalised id is a prerequisite only for
consumers that need to join across datasets, not for the query itself.

## 3. Geometry and containment

- All coordinates are **WGS84 (EPSG:4326)**, matching the boundary datasets and the lookup API.
- Containment uses **point-in-polygon on the address point**, via the same primitive the point lookup
  uses (`isPointInPolygon` in `src/utils.ts`). An area result and a point lookup must agree: a record
  returned for a riding is a record whose address resolves to that riding.
- **Edge behaviour:** a point exactly on a boundary is decided by the same `isPointInPolygon`
  implementation as the lookup, not by a second rule. Where boundaries of two ridings overlap or a
  point sits on a shared edge, the polygon order the lookup already uses decides; the contract does
  not introduce a tie-break of its own.
- Riding-bounded queries need no input geometry: the boundary is the dataset's polygon for that
  riding. **Arbitrary Polygon/MultiPolygon input is W9**, and this contract fixes only its future
  slot (validated WGS84 GeoJSON, ring closure, winding tolerance).

## 4. Query (v1, riding-bounded)

```
GET /api/area?dataset=on&riding=<id-or-name>&page_size=100&cursor=<opaque>
```

- `dataset` — as on `/api/quote`: `federal` (default), `combined`, or a province code.
- `riding` — required for a riding-bounded query; the riding's `id` or `name`.
- `page_size` — optional, default **100**, maximum **250** (the size of one area unit).
- `cursor` — optional, opaque; returned by the previous page.

## 5. Output

```json
{
  "query": { "dataset": "on", "riding": "Ottawa Centre" },
  "riding": { "datasetId": "…", "datasetYear": 2024, "id": "…", "name": "Ottawa Centre" },
  "count": { "returned": 100, "total": 812, "exact": false },
  "records": [ { "civicNumber": "111", "streetName": "WELLINGTON", "…": "…",
                 "lat": 45.4236, "lon": -75.7008,
                 "dataSource": "NAR", "dataVintage": "2026-06-26",
                 "riding": { "…": "…" } } ],
  "page": { "cursor": "opaque-or-null", "hasMore": true },
  "attribution": [ "…" ],
  "datasetId": "…", "datasetYear": 2024
}
```

- `count.total` is **exact when affordable, otherwise an estimate** and then `exact: false`; the plan
  forbids presenting an estimate as exact.
- `attribution` is the machine-readable array from W0 §4, on every response.
- `page.cursor` is `null` on the last page.

## 6. Paging

- **Order** is by `id` — the table's primary key — so keyset paging (`WHERE id > ? ORDER BY id
  LIMIT ?`) is index-supported and costs one page, not one sort of the whole candidate set.
- **Cursor** is opaque and encodes the last record's `id` **and the dataset vintage**
  (`datasetId` + `datasetYear`).
- A cursor presented against a different vintage is rejected with `CURSOR_INVALID` rather than
  silently resuming against different data — the same rule as a dataset pin (ADR 0004).
- Pages are stable within a vintage: the same cursor returns the same records.

**Amended 2026-10-16, after checking the schema.** The order key was originally a content key —
`(postal_code, street_name, street_type, civic_number, unit, id)` — chosen so paging would survive a
re-import. Two things changed that:

1. **It has no index.** `oda_addresses` is indexed on `(province, postal_code)`,
   `(province, city_key, street_key, civic_number)`, `search_key`, `(province, city_key)` and
   `(province, lat, lon)` (`src/oda-schema.ts`). None matches a six-column content key, so every page
   would sort the riding's whole candidate set to return 100 records.
2. **The vintage check already covers the re-import case.** A re-import changes the dataset vintage,
   and the cursor carries the vintage, so a stale cursor is rejected with `CURSOR_INVALID` whatever
   the order key is. The content key bought nothing the vintage check did not already give.

Order is observable only as the sequence records arrive in, and a bulk consumer that wants address
order can sort client-side. `id` is stable within a vintage, which is the only window a cursor is
valid in.

**Cost to watch in W8.** The bounding-box prefilter uses `idx_oda_coords (province, lat, lon)`, which
supports `province = ? AND lat BETWEEN ? AND ?`; the `lon` range and the exact point-in-polygon test
are applied per row. If a page turns out to scan too many rows to fill, the fix is a composite index —
not a different order key.

## 7. Caps and billing — amends W0 §7

W0 fixed the unit and enforced the cap by **rejection**. Paging changes the second half, so this is an
explicit amendment, not a silent change:

- **Unit unchanged:** one **area unit** = up to **250 returned records**, priced **$2.00 USD**.
- **The query maximum is bounded by the offer, not by one page.** An offer states `maximumResults`
  (the total the buyer is willing to pay for) and a price ceiling of
  `ceil(maximumResults / 250) × unit price`.
- **Pages are delivery, not charges.** One accepted offer is charged once, however many pages it takes.
  A retry with the same idempotency key never charges twice.
- **Never over-deliver past the paid ceiling.** If the true count exceeds `maximumResults`, the final
  page stops at the ceiling and the response sets `page.truncated: true`, so a buyer knows to request a
  larger offer. Silently returning more than was paid for would break the offer binding.
- **v1 query maximum: 1,000 records (4 units, $8.00)** — a starting number, deliberately modest; raise
  it once real query sizes are known. *(Recommended; confirm before W8 ships.)*

## 8. Data vintage

Every record carries its `dataSource` (`ODA` or `NAR`) and `dataVintage`. Provenance is per record,
because NAR migrates city by city. A requested vintage that is unavailable fails hard rather than
substituting (ADR 0004).

## 9. Errors

| Code | When |
|---|---|
| `RIDING_NOT_FOUND` | `riding` matches no feature in the dataset |
| `DATASET_UNAVAILABLE` | unknown dataset, or an unavailable vintage pin |
| `NO_ADDRESS_COVERAGE` | the riding is in a jurisdiction with no imported address rows (today NL, NU, YT) — never an empty `records` array standing in for it |
| `CURSOR_INVALID` | malformed cursor, or one from a different dataset vintage |
| `INVALID_QUERY` | unusable parameters (e.g. `page_size` out of range) |
| `LIMIT_EXCEEDED` | the requested `maximumResults` exceeds the v1 maximum |
| `QUOTES_UNAVAILABLE` / `PAYMENTS_UNAVAILABLE` | as on `/api/quote` |
| `INVALID_SHAPE` | reserved for W9 polygon input |

## 10. Limits (must never be unlimited)

| Limit | v1 |
|---|---|
| `page_size` | default 100, max 250 |
| `maximumResults` per offer | max 1,000 (recommended; §7) |
| Response size | page-bounded by `page_size`; enforce a hard byte cap and fail with `LIMIT_EXCEEDED` rather than truncating mid-record |
| Compute per request | one paged query; no unbounded scans — the query is indexed on the order key |
| Geometry (W9) | vertices and area caps, validated before processing |

## 11. What W8 must build

1. An indexed, paged D1 query over `oda_addresses` scoped to a riding's bounding box, with exact
   point-in-polygon filtering and the §6 order key.
2. A cursor codec carrying the order key and the dataset vintage.
3. `GET /api/area` behind the same quote/accept flow as point lookups (W5/W6), reusing the offer
   machinery rather than a second pricing path.
4. An exact-or-estimated `count.total`, labelled honestly.
5. `NO_ADDRESS_COVERAGE` for the not-yet-imported jurisdictions.

## 12. Open items

- **The v1 query maximum** (§7) — recommended 1,000 records; confirm.
- **Normalised riding id** (§2) — needed only for cross-dataset joins.
- **`combined` semantics for area queries** — whether `combined` returns federal *and* provincial
  memberships per record, or is restricted to `federal` / one province. Restricting it in v1 is the
  simpler, more predictable option.
