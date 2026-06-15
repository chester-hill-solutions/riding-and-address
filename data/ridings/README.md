# Riding boundary GeoJSON files

Place boundary datasets here before uploading to R2:

| File | Route | Source |
|------|-------|--------|
| `federalridings-2024.geojson` | `/api/federal` | (project dataset) |
| `quebecridings-2025.geojson` | `/api/qc` | [DGEQ 2026 electoral map (GeoJSON)](https://donnees.electionsquebec.qc.ca/autres/provincial/circonscriptions_electorales_sans_eau_2026.json) — 125 ridings, effective July 15, 2026 |
| `ontarioridings-2022.geojson` | `/api/on` | (project dataset) |

Download Quebec boundaries:

```bash
curl -sL 'https://donnees.electionsquebec.qc.ca/autres/provincial/circonscriptions_electorales_sans_eau_2026.json' \
  -o data/ridings/quebecridings-2025.geojson
```

Use of DGEQ data requires the [open data user licence](https://dgeq.org/en/licence.html).

Upload and verify:

```bash
npx tsx scripts/upload-r2-datasets.ts
npx tsx scripts/upload-r2-datasets.ts --verify-only
```

The admin `/health` endpoint reports `datasets` availability and returns `status: unhealthy` when any required file is missing from R2.
