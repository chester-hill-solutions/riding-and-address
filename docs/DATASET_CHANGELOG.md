# Dataset changelog

Customer-facing record of boundary and address-data vintages served by CanCoder.

| Date (UTC) | Dataset id | Year | Notes |
|---|---|---|---|
| 2024– | `federalridings-2024.geojson` | 2024 | Federal ridings (Elections Canada open data) |
| 2022– | `ontarioridings-2022.geojson` | 2022 | Ontario provincial |
| 2025– | `quebecridings-2025.geojson` | 2025 | Quebec provincial (DGEQ open data) |
| — | Other `*ridings-*.geojson` | — | See `src/datasets.ts` registry; provenance is official electoral open data, not OpenNorth |

| 2026-09-15 | NAR city refresh | 2026 | Addresses for **Toronto** replaced from the StatCan [National Address Register](https://www150.statcan.gc.ca/n1/en/catalogue/46260002) (June 2026, 46-26-0002), superseding the 2021 ODA rows for that city |

ODA (StatCan Open Database of Addresses) is used for **addresses only**, not riding polygons.

Address provenance is now **per city**: responses report `dataSource.provider` as `statcan-oda`
(2021 ODA) or `statcan-nar` (a refreshed city, with the NAR vintage in `dataSource.version`).
Cities migrate one at a time, so a single province can contain both until the rotation completes.
See [nar-data-import.md](nar-data-import.md).

## Pinning

Pass `dataset=` or `pin=` on lookup routes to require a vintage. Mismatch → HTTP 404 `DATASET_UNAVAILABLE`. Dual-serve of old+new vintages is **not** supported in this launch.

## Ops

After uploading new GeoJSON to R2, follow [ops/cache-purge-runbook.md](ops/cache-purge-runbook.md).
