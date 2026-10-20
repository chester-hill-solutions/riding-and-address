# Dataset changelog

Customer-facing record of boundary and address-data vintages served by CanCoder.

| Date (UTC) | Dataset id | Year | Notes |
|---|---|---|---|
| 2024– | `federalridings-2024.geojson` | 2024 | Federal ridings (Elections Canada open data) |
| 2022– | `ontarioridings-2022.geojson` | 2022 | Ontario provincial |
| 2025– | `quebecridings-2025.geojson` | 2025 | Quebec provincial (DGEQ open data) |
| — | Other `*ridings-*.geojson` | — | See `src/datasets.ts` registry; provenance is official electoral open data, not OpenNorth |

| 2026-09-15 | NAR city refresh | 2026 | Addresses for **Toronto** replaced from the StatCan [National Address Register](https://www150.statcan.gc.ca/n1/en/catalogue/46260002) (June 2026, 46-26-0002), superseding the 2021 ODA rows for that city |

## Municipal and sub-municipal boundary datasets

Boundary sets for the levels below the riding. Each is acquired from an official source,
copied into CanCoder's own R2, and recorded in `data/geo/PROVENANCE.json` with its
licence, attribution, feature count and SHA-256. See
[plans/municipal-and-submunicipal-geography.md](plans/municipal-and-submunicipal-geography.md).

| Date (UTC) | Dataset id | Year | Notes |
|---|---|---|---|
| 2026-10-19 | `census-subdivisions-2016.geojson` | 2016 | Census subdivisions (5,162). © Statistics Canada, 2016 Census of Population — Open Government Licence – Canada |
| 2026-10-19 | `census-divisions-2016.geojson` | 2016 | Census divisions (293). © Statistics Canada, 2016 Census of Population — Open Government Licence – Canada |
| 2026-10-19 | `census-metropolitan-areas-2021.geojson` | 2021 | Census metropolitan areas (156). © Statistics Canada, 2021 Census of Population — Open Government Licence – Canada |
| 2026-10-19 | `federal-polling-divisions-2025.geojson` | 2025 | Federal polling divisions (71,687). © Elections Canada, 45th General Election (2025) — Open Government Licence – Canada |
| 2026-10-19 | `federal-electoral-districts-2025.geojson` | 2025 | Federal electoral districts (352). © Elections Canada — Open Government Licence – Canada |

Historical federal polling divisions for 2015, 2019 and 2021 are registered in
`src/geo-datasets.ts` and are acquired from the Government of Canada shared ArcGIS
services. The pre-2000 federal archives on GeoGratis carry the Elections Canada
unrestricted-use licence, which is a different document from the Open Government Licence
and has to be read per vintage rather than assumed.

A polling division number is unique only inside its federal electoral district and only
for the election it was drawn for. Responses state the vintage of every level they
answer; a polling division number without its vintage is not a usable identifier.

ODA (StatCan Open Database of Addresses) is used for **addresses only**, not riding polygons.

Address provenance is now **per city**: responses report `dataSource.provider` as `statcan-oda`
(2021 ODA) or `statcan-nar` (a refreshed city, with the NAR vintage in `dataSource.version`).
Cities migrate one at a time, so a single province can contain both until the rotation completes.
See [nar-data-import.md](nar-data-import.md).

## Pinning

Pass `dataset=` or `pin=` on lookup routes to require a vintage. Mismatch → HTTP 404 `DATASET_UNAVAILABLE`. Dual-serve of old+new vintages is **not** supported in this launch.

## Ops

After uploading new GeoJSON to R2, follow [ops/cache-purge-runbook.md](ops/cache-purge-runbook.md).
