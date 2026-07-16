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
| `nsridings-2022.geojson` | `/api/ns` | Elections Nova Scotia official GIS — place GeoJSON in `data/ridings/.raw/NS.geojson` |
| `nbridings-2022.geojson` | `/api/nb` | [NB Open Data — 2020 districts (GeoJSON)](https://gnb.socrata.com/api/geospatial/c468-yuuy?method=export&format=GeoJSON) |
| `mbridings-2022.geojson` | `/api/mb` | Elections Manitoba official boundaries — place GeoJSON in `data/ridings/.raw/MB.geojson` |
| `skridings-2022.geojson` | `/api/sk` | [Elections Saskatchewan shapefiles](https://cdn.elections.sk.ca/maps-ge30/ESK_KML_Shape_Files_Mar2024.zip) |
| `nlridings-2022.geojson` | `/api/nl` | [NL Open Data electoral districts](https://opendata.gov.nl.ca/public/opendata/filedownload/?file-id=3323) |
| `peridings-2022.geojson` | `/api/pe` | Elections PEI official boundaries — place GeoJSON in `data/ridings/.raw/PE.geojson` |
| `ntridings-2022.geojson` | `/api/nt` | Elections NWT official boundaries — place GeoJSON in `data/ridings/.raw/NT.geojson` |
| `nuridings-2022.geojson` | `/api/nu` | [Elections Nunavut GIS 2025](https://www.elections.nu.ca/en/file-download/download/public/2034) |
| `ytridings-2022.geojson` | `/api/yt` | [GeoYukon electoral districts SHP](https://map-data.service.yukon.ca/GeoYukon/Administrative_Boundaries/Yukon_Electoral_Districts/Yukon_Electoral_Districts.shp.zip) |

Each feature is normalized to include `ENGLISH_NAME` and `PROV_TERR` for lookup and `include_province` resolution.

Use of DGEQ data requires the [open data user licence](https://dgeq.org/en/licence.html).
