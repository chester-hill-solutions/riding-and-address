# Dataset changelog

Customer-facing record of boundary and address-data vintages served by Riding & Address.

| Date (UTC) | Dataset id | Year | Notes |
|---|---|---|---|
| 2024– | `federalridings-2024.geojson` | 2024 | Federal ridings (Elections Canada open data) |
| 2022– | `ontarioridings-2022.geojson` | 2022 | Ontario provincial |
| 2025– | `quebecridings-2025.geojson` | 2025 | Quebec provincial (DGEQ open data) |
| — | Other `*ridings-*.geojson` | — | See `src/datasets.ts` registry; provenance is official electoral open data, not OpenNorth |

ODA (StatCan Open Database of Addresses) is used for **addresses only**, not riding polygons.

## Pinning

Pass `dataset=` or `pin=` on lookup routes to require a vintage. Mismatch → HTTP 404 `DATASET_UNAVAILABLE`. Dual-serve of old+new vintages is **not** supported in this launch.

## Ops

After uploading new GeoJSON to R2, follow [ops/cache-purge-runbook.md](ops/cache-purge-runbook.md).
