# Riding boundary GeoJSON files

Place boundary datasets here before uploading to R2. Files are gitignored; use the acquisition script to regenerate them.

## Acquire all provincial datasets

```bash
python3 scripts/acquire-provincial-ridings.py
npx tsx scripts/upload-r2-datasets.ts --remote
npx tsx scripts/upload-r2-datasets.ts --verify-only --remote
```

Normalize a single GeoJSON file manually:

```bash
npx tsx scripts/normalize-riding-geojson.ts --code BC --input raw.geojson --output data/ridings/bcridings-2022.geojson
```

## Registry (R2 keys)

| File | Route | Source |
|------|-------|--------|
| `federalridings-2024.geojson` | `/api/federal` | (project dataset) |
| `ontarioridings-2022.geojson` | `/api/on` | (project dataset) |
| `quebecridings-2025.geojson` | `/api/qc` | [DGEQ 2026 electoral map](https://donnees.electionsquebec.qc.ca/autres/provincial/circonscriptions_electorales_sans_eau_2026.json) |
| `bcridings-2022.geojson` | `/api/bc` | [BC Data Catalogue — 2023 redistribution](https://catalogue.data.gov.bc.ca/dataset/1cba4b16-263f-4d42-8d84-f5fecaa03d1a) |
| `abridings-2022.geojson` | `/api/ab` | [Elections Alberta ED shapefiles](https://www.elections.ab.ca/uploads/2019Boundaries_ED-Shapefiles.zip) |
| `nsridings-2022.geojson` | `/api/ns` | Elections Nova Scotia via [OpenNorth 2019 boundaries](https://represent.opennorth.ca/boundary-sets/nova-scotia-electoral-districts-2019/) |
| `nbridings-2022.geojson` | `/api/nb` | [NB Open Data — 2020 districts (GeoJSON)](https://gnb.socrata.com/api/geospatial/c468-yuuy?method=export&format=GeoJSON) |
| `mbridings-2022.geojson` | `/api/mb` | Elections Manitoba via [OpenNorth 2018 boundaries](https://represent.opennorth.ca/boundary-sets/manitoba-electoral-districts-2018/) |
| `skridings-2022.geojson` | `/api/sk` | Elections Saskatchewan via [OpenNorth 2022 boundaries](https://represent.opennorth.ca/boundary-sets/saskatchewan-electoral-districts-representation-act-2022/) |
| `nlridings-2022.geojson` | `/api/nl` | Elections NL via [OpenNorth boundaries](https://represent.opennorth.ca/boundary-sets/newfoundland-and-labrador-electoral-districts/) |
| `peridings-2022.geojson` | `/api/pe` | Elections PEI via [OpenNorth 2017 boundaries](https://represent.opennorth.ca/boundary-sets/prince-edward-island-electoral-districts-2017/) |
| `ntridings-2022.geojson` | `/api/nt` | Elections NWT via [OpenNorth 2013 boundaries](https://represent.opennorth.ca/boundary-sets/northwest-territories-electoral-districts-2013/) |
| `nuridings-2022.geojson` | `/api/nu` | [Elections Nunavut GIS 2025](https://www.elections.nu.ca/en/file-download/download/public/2034) |
| `ytridings-2022.geojson` | `/api/yt` | [GeoYukon electoral districts SHP](https://map-data.service.yukon.ca/GeoYukon/Administrative_Boundaries/Yukon_Electoral_Districts/Yukon_Electoral_Districts.shp.zip) |

Each feature is normalized to include `ENGLISH_NAME` and `PROV_TERR` for lookup and `include_province` resolution.

Use of DGEQ data requires the [open data user licence](https://dgeq.org/en/licence.html).
