# Adding a New Province to Riding Lookup

This guide documents the exact steps to add a new province or territory to the Riding Lookup API. The codebase uses a registry pattern so most changes are additive — no existing files need to be modified beyond the registry array.

## Prerequisites

1. Official electoral boundary data from the province's electoral boundary commission or elections agency
2. The data must be in a GIS format (Shapefile, GeoJSON, or similar)
3. Access to the Cloudflare R2 bucket for uploading the dataset

## Step-by-Step Process

### 1. Find and Download the Official Shapefile

Locate the official electoral boundary data from the appropriate source:

| Province | Source |
|----------|--------|
| British Columbia | Elections BC / BC Data Catalogue |
| Alberta | Elections Alberta |
| Nova Scotia | Elections Nova Scotia |
| New Brunswick | Elections New Brunswick |
| Manitoba | Elections Manitoba |
| Saskatchewan | Elections Saskatchewan |
| Newfoundland and Labrador | Elections NL |
| Prince Edward Island | Elections PEI |
| Northwest Territories | Elections NWT |
| Nunavut | Elections Nunavut |
| Yukon | Elections Yukon |

**What to look for:**
- File format: `.shp` (Shapefile), `.geojson`, `.kml`, or `.gpkg`
- Coordinate system: WGS84 (EPSG:4326) or NAD83 (EPSG:4269)
- Year: current electoral boundaries (usually 2022 or later)
- Features: each riding should be a separate polygon with properties

### 2. Convert to GeoJSON (WGS84, EPSG:4326)

If the data is not already in GeoJSON format with WGS84 coordinates, convert it:

```bash
# Using ogr2ogr (GDAL)
ogr2ogr -f GeoJSON -t_srs EPSG:4326 output.geojson input.shp

# Using mapshaper (npm install -g mapshaper)
mapshaper input.shp -proj wgs84 -o output.geojson

# Using Python (geopandas)
python3 -c "
import geopandas as gpd
gdf = gpd.read_file('input.shp')
gdf = gdf.to_crs('EPSG:4326')
gdf.to_file('output.geojson', driver='GeoJSON')
"
```

**Validate the output:**
```bash
# Check that it's a valid FeatureCollection
python3 -c "
import json
with open('output.geojson') as f:
    data = json.load(f)
assert data['type'] == 'FeatureCollection'
assert len(data['features']) > 0
print(f'Valid: {len(data[\"features\"])} features')
"
```

### 3. Validate Feature Properties

Each feature must have a property that can be used as the riding name. The API tries these properties in order:

1. `ENGLISH_NAME`
2. `ENGLISH_NA`
3. `NAME_EN`
4. `FED_NAME`
5. `ED_NAMEE`

**Check your data:**
```bash
python3 -c "
import json
with open('output.geojson') as f:
    data = json.load(f)

for feat in data['features'][:5]:
    props = feat['properties']
    name = props.get('ENGLISH_NAME') or props.get('ENGLISH_NA') or props.get('NAME_EN') or props.get('FED_NAME') or props.get('ED_NAMEE')
    print(f'Feature: {name}')
    print(f'  Properties: {list(props.keys())}')
"
```

**If the property names don't match, you can rename them:**
```bash
python3 -c "
import json
with open('output.geojson') as f:
    data = json.load(f)

for feat in data['features']:
    props = feat['properties']
    # Adjust these based on your data's actual property names
    if 'RidingName' in props:
        props['ENGLISH_NAME'] = props.pop('RidingName')
    # Add PROV_TERR for include_province resolution
    props['PROV_TERR'] = 'BC'  # or appropriate province code

with open('output.geojson', 'w') as f:
    json.dump(data, f)
"
```

### 4. Name the File Correctly

The file must follow the naming convention:

```
{codeshort}ridings-{year}.geojson
```

Where:
- `{codeshort}` is the 2-letter province code (e.g., `bc`, `ab`, `ns`)
- `{year}` is the boundary year (e.g., `2022`, `2025`)

**Examples:**
- `bcridings-2022.geojson`
- `abridings-2022.geojson`
- `nsridings-2022.geojson`

### 5. Upload to R2

Upload the GeoJSON file to the Cloudflare R2 bucket:

```bash
# Using wrangler
wrangler r2 object put ridings/bcridings-2022.geojson --file ./bcridings-2022.geojson

# Using aws-cli (if configured)
aws s3 cp ./bcridings-2022.geojson s3://ridings/bcridings-2022.geojson --endpoint-url https://<account-id>.r2.cloudflarestorage.com
```

### 6. Register the Province in the Dataset Registry

Open `src/datasets.ts` and add the province to the `PROVINCIAL_DATASETS` array:

```typescript
export const PROVINCIAL_DATASETS: readonly ProvincialDataset[] = [
  // ... existing entries ...
  {
    code: 'bc',
    r2Key: 'bcridings-2022.geojson',
    name: 'British Columbia',
    year: 2022,
    path: '/api/bc',
    aliases: ['BC', 'B.C.', 'BRITISH COLUMBIA'],
    status: 'registered',
  },
  // ...
];
```

**Required fields:**
- `code`: 2-letter lowercase code (e.g., `bc`, `ab`)
- `r2Key`: exact filename in R2 (must match Step 4)
- `name`: full province name (for documentation)
- `year`: boundary year
- `path`: API endpoint path (e.g., `/api/bc`)
- `aliases`: array of strings that the federal lookup uses to match `PROV_TERR` to this province. Include:
  - Standard abbreviation (e.g., `BC`)
  - Full name (e.g., `BRITISH COLUMBIA`)
  - Common variations (e.g., `B.C.`)
- `status`: `registered` when first adding the endpoint in code; change to `live` after the R2 upload succeeds (required for health checks and cache warming)

**The registry in `src/datasets.ts` is the single source of truth.** Once added:
- `pickDataset('/api/bc')` will resolve to the correct R2 key
- `provincePathFromFederalProperties()` will match `PROV_TERR: "BC"` to `/api/bc`
- The OpenAPI spec will automatically include `/api/bc`
- The landing page will show `/api/bc` in the endpoint dropdown
- The batch endpoint will accept `/api/bc` as a valid pathname

### 7. Promote to `live` and test with known addresses

After R2 upload, set `status: 'live'` for the province in `src/datasets.ts`, then verify:

```bash
# Test with a known address
curl "https://your-worker.example.com/api/bc?address=123%20Main%20St,%20Vancouver,%20BC" \
  -H "Authorization: Basic $(echo -n 'username:password' | base64)"

# Test with coordinates
curl "https://your-worker.example.com/api/bc?lat=49.2827&lon=-123.1207" \
  -H "Authorization: Basic $(echo -n 'username:password' | base64)"

# Test include_province from federal lookup
curl "https://your-worker.example.com/api/combined?postal=V6B%201A1&include_province=true" \
  -H "Authorization: Basic $(echo -n 'username:password' | base64)"
```

### 8. Update Documentation

If this is the first time adding a province, you may need to:

1. Update the Provincial Coverage matrix in `README.md`
2. Update the `docs/RIDING-EXPANSION-EPIC.md` to mark the province as complete

## Troubleshooting

### "R2 object not found" error

- Verify the file was uploaded to the correct bucket (`ridings`)
- Verify the filename matches exactly (case-sensitive)
- Check `wrangler r2 object list ridings` to confirm

### "Failed to create spatial index" error

- Verify the GeoJSON is a valid `FeatureCollection`
- Verify all features have `geometry` with `coordinates` array
- Check that the coordinate system is WGS84 (EPSG:4326)

### Riding name is undefined

- Check that feature properties include one of the supported name fields
- Add property name mapping in Step 3 if needed

### include_province doesn't work

- Verify the federal dataset has `PROV_TERR` or `PROV_CODE` property
- Verify the alias matches exactly (case-insensitive, spaces are normalized)
- Check that `PROV_TERR` uses the same abbreviation as your aliases

## Registry Reference

Current registry in `src/datasets.ts` (see file for full list). Each entry includes `status: 'live' | 'registered'`.

```typescript
export const PROVINCIAL_DATASETS: readonly ProvincialDataset[] = [
  { code: "on", r2Key: "ontarioridings-2022.geojson", name: "Ontario", year: 2022, path: "/api/on", aliases: ["ON", "ONT", "ONTARIO"] },
  { code: "qc", r2Key: "quebecridings-2025.geojson", name: "Quebec", year: 2025, path: "/api/qc", aliases: ["QC", "QUE", "QUEBEC", "QUÉBEC"] },
  { code: "bc", r2Key: "bcridings-2022.geojson", name: "British Columbia", year: 2022, path: "/api/bc", aliases: ["BC", "B.C.", "BRITISH COLUMBIA"] },
  { code: "ab", r2Key: "abridings-2022.geojson", name: "Alberta", year: 2022, path: "/api/ab", aliases: ["AB", "ALBERTA"] },
  { code: "ns", r2Key: "nsridings-2022.geojson", name: "Nova Scotia", year: 2022, path: "/api/ns", aliases: ["NS", "NOVA SCOTIA"] },
  { code: "nb", r2Key: "nbridings-2022.geojson", name: "New Brunswick", year: 2022, path: "/api/nb", aliases: ["NB", "NEW BRUNSWICK"] },
  { code: "mb", r2Key: "mbridings-2022.geojson", name: "Manitoba", year: 2022, path: "/api/mb", aliases: ["MB", "MANITOBA"] },
  { code: "sk", r2Key: "skridings-2022.geojson", name: "Saskatchewan", year: 2022, path: "/api/sk", aliases: ["SK", "SASKATCHEWAN"] },
  { code: "nl", r2Key: "nlridings-2022.geojson", name: "Newfoundland and Labrador", year: 2022, path: "/api/nl", aliases: ["NL", "NEWFOUNDLAND", "NEWFOUNDLAND AND LABRADOR", "LABRADOR"] },
  { code: "pe", r2Key: "peridings-2022.geojson", name: "Prince Edward Island", year: 2022, path: "/api/pe", aliases: ["PE", "PEI", "PRINCE EDWARD ISLAND"] },
  { code: "nt", r2Key: "ntridings-2022.geojson", name: "Northwest Territories", year: 2022, path: "/api/nt", aliases: ["NT", "NWT", "NORTHWEST TERRITORIES"] },
  { code: "nu", r2Key: "nuridings-2022.geojson", name: "Nunavut", year: 2022, path: "/api/nu", aliases: ["NU", "NUNAVUT"] },
  { code: "yt", r2Key: "ytridings-2022.geojson", name: "Yukon", year: 2022, path: "/api/yt", aliases: ["YT", "YUKON", "YUKON TERRITORY"] },
];
```

## Adding a Province: Checklist

- [ ] Downloaded official boundary data from electoral commission
- [ ] Converted to GeoJSON in WGS84 (EPSG:4326)
- [ ] Verified feature properties include riding name
- [ ] Named file correctly: `{codeshort}ridings-{year}.geojson`
- [ ] Uploaded to R2 bucket
- [ ] Added entry to `PROVINCIAL_DATASETS` in `src/datasets.ts` with `status: 'registered'`
- [ ] Set `status: 'live'` after R2 upload succeeds
- [ ] Verified `aliases` include all common abbreviations
- [ ] Tested endpoint with known addresses
- [ ] Tested `include_province=true` from federal lookup
- [ ] Updated `README.md` coverage matrix
- [ ] Committed and pushed changes
