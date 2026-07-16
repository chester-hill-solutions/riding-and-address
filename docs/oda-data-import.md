# ODA Data Import

## Source

Statistics Canada [Open Database of Addresses (ODA)](https://www.statcan.gc.ca/en/lode/databases/oda), version 1.0 (2021001), Open Government License - Canada.

Data collection period: January–April 2021. New developments after 2021 may be missing. Statistics Canada is developing a National Address Register (NAR) as a successor source.

## Province downloads

Base URL: `https://www150.statcan.gc.ca/n1/en/pub/46-26-0001/2021001/`

| Province | File | Approx. zip size |
|----------|------|------------------|
| Ontario | `ODA_ON_v1.zip` | ~154 MB |
| Quebec | `ODA_QC_v1.zip` | ~37 MB |
| Alberta | `ODA_AB_v1.zip` | ~70 MB |
| British Columbia | `ODA_BC_v1.zip` | ~26 MB |
| Manitoba | `ODA_MB_v1.zip` | ~11 MB |
| New Brunswick | `ODA_NB_v1.zip` | ~33 MB |
| Northwest Territories | `ODA_NT_v1.zip` | ~1 MB |
| Nova Scotia | `ODA_NS_v1.zip` | ~51 MB |
| Prince Edward Island | `ODA_PE_v1.zip` | ~3 MB |
| Saskatchewan | `ODA_SK_v1.zip` | ~5 MB |

**Not on StatCan ODA:** Newfoundland and Labrador (NL), Nunavut (NU), Yukon (YT). Riding boundaries exist for these territories; address geocoding uses GeoGratis/Google fallbacks.

Production target: all 10 StatCan provinces. Set `ODA_PROVINCES` in `wrangler.jsonc` to match imported data:

```
ODA_PROVINCES: "AB,BC,MB,NB,NT,NS,ON,PE,QC,SK"
```

## Recommended import order

Import smaller provinces first to validate the pipeline, then larger ones. Use `--resume` for every production run.

1. PE, NT (~1–8 min each)
2. NB, NS (~30–90 min each)
3. SK, MB (~15–45 min each)
4. AB, BC (~1–3 hr each)
5. QC (~1–2 hr; re-import if row count is low)
6. ON (~6–12 hr; use `--resume` — partial imports are common)

Pilot one province before a full rollout:

```bash
npm run import:oda -- --download --provinces NS --remote --skip-schema --max-rows 10000
```

## Import pipeline

```bash
# 1. Create D1 database (once)
wrangler d1 create oda-addresses

# 2. Add ODA_DB binding to wrangler.jsonc (see README)

# 3. Initialize schema (via API or import script)
curl -X POST https://your-worker.workers.dev/api/oda/init \
  -H "Authorization: Basic ..."

# 4. Import all StatCan provinces (sequential, with resume)
npm run import:oda:all

# Or one province:
npm run import:oda -- --download --provinces NB --remote --skip-schema --resume

# Fixture / local CSV (dev)
npm run import:oda -- --provinces ON,QC,BC --file test/fixtures/oda/fixture.csv --local --skip-schema

# 5. Verify stats
curl https://your-worker.workers.dev/api/oda/stats -H "Authorization: Basic ..."
# Or via D1:
wrangler d1 execute oda-addresses --remote --command \
  "SELECT province, COUNT(*) as cnt FROM oda_addresses GROUP BY province ORDER BY province;"

# 6. Optional: build the autocomplete index for /api/search
npm run build:oda:suggest -- --provinces ON --remote
```

## Autocomplete index

`GET /api/search` needs two extra tables: `oda_street_suggest` (one row per street-in-city) and
`oda_suggest_fts` (an FTS5 index over it). They are **not** part of the base schema and are not
created by `/api/oda/init`, so the import above is unaffected by them.

Both are derived: every row is computed inside D1 from `oda_street_ranges` and
`oda_city_centroids`, which the import has already written. Nothing is downloaded, no CSV is
re-parsed, and `oda_addresses` is never scanned — so this takes **seconds, not hours**, and never
requires a re-import.

```bash
# Local (against the fixture database)
npm run build:oda:suggest -- --provinces ON,QC --local

# Remote, one province at a time
npm run build:oda:suggest -- --provinces ON --remote

# All provinces
npm run build:oda:suggest -- --provinces ALL --remote
```

Then verify and enable:

```bash
curl https://your-worker.workers.dev/api/oda/stats -H "Authorization: Basic ..."
# -> "streetSuggest": 148213

# Only now flip ODA_SUGGEST_ENABLED to "true" in wrangler.jsonc
```

**Prerequisite:** the centroid tables must be populated. If a province reports 0 suggestions, run
`npm run import:oda:centroids` (or `--centroids-only`) first.

The build is idempotent per province — it clears and reinserts that province, so re-running is
safe. Rollout is reversible at every step: building the index changes nothing while
`ODA_SUGGEST_ENABLED` is `false`, and turning the flag back off restores the previous behaviour
with no redeploy and no data change.

### Build script options

`scripts/build-oda-suggest.ts` is invoked via `npm run build:oda:suggest -- [options]`.

| Flag | Description |
|------|-------------|
| `--provinces ON,QC` or `ALL` | Provinces to build (default: `ON`) |
| `--remote` | Write to remote D1 (omit for `--local` dev database) |
| `--local` | Implicit when `--remote` is omitted |
| `--database name` | D1 database name (default: `oda-addresses`) |
| `--skip-schema` | Skip creating the suggest tables (use when they already exist) |
| `--output-dir dir` | SQL staging dir (default: `.oda-suggest`) |

### FTS5 support

The index uses SQLite FTS5 with prefix indexes (`prefix='2 3 4'`). Cloudflare
[documents FTS5 as supported on D1](https://developers.cloudflare.com/d1/sql-api/sql-statements/).
The `trigram` tokenizer is **not** documented for D1 and is deliberately unused — prefix matching
is what autocomplete needs.

Verify against your database before rolling out:

```bash
wrangler d1 execute oda-addresses --remote --command \
  "CREATE VIRTUAL TABLE _fts_probe USING fts5(t, prefix='2 3');"
wrangler d1 execute oda-addresses --remote --command "DROP TABLE _fts_probe;"
```

Note the prefix index roughly doubles the FTS table size, so check `wrangler d1 info` against your
plan's storage limit before building all ten provinces. This is the main reason to roll out one
province at a time.

## Import script options

`scripts/import-oda.ts` is invoked via `npm run import:oda -- [options]`.

| Flag | Description |
|------|-------------|
| `--download` | Download and unzip province CSV from StatCan (`ODA_{PR}_v1.zip`) |
| `--provinces ON,QC` or `ALL` | Provinces to import (default: `ON,QC`; `ALL` = all 10 StatCan codes) |
| `--file path.csv` | Local CSV instead of download |
| `--remote` | Write to remote D1 (omit for `--local` dev database) |
| `--local` | Implicit when `--remote` is omitted |
| `--database name` | D1 database name (default: `oda-addresses`) |
| `--skip-schema` | Skip table creation (use after `/api/oda/init` or first run) |
| `--batch-size N` | Rows per D1 upload batch (default: 500) |
| `--max-rows N` | Stop after N address rows (pilot imports) |
| `--resume` | Skip address rows already present in D1; rebuilds centroids from the full CSV at end |
| `--centroids-only` | Rebuild postal/city/street centroids from CSV without re-importing addresses |
| `--output-dir dir` | Download/extract/SQL staging dir (default: `.oda-import`) |

The import script:

1. Downloads and unzips province CSV when `--download` is set (StatCan `ODA_{PR}_v1.zip`)
2. Streams rows from CSV (supports `--max-rows` for pilots)
3. Normalizes rows via `src/oda-normalize.ts` (fixture and StatCan column layouts)
4. Builds Canada Post-style mailing fields
5. Batch inserts into D1 with retry on upload failures (`--batch-size`, default 500)
6. Computes postal/city centroids and street ranges
7. Records import metadata in `oda_imports`

Ontario (`ODA_ON_v1.csv`) is ~690 MB uncompressed (~6M addresses). Full import takes several hours over `--remote`. Use `--resume` if a long import is interrupted.

## D1 scale check

Before a full national import, verify:

- Current database size: `wrangler d1 info oda-addresses --json`
- Cloudflare D1 storage limits for your plan (10 provinces can reach several GB)
- Write throughput (batch size tuning)
- Query latency for exact, postal, city, and nearest-neighbor lookups

If D1 cannot hold the full address table:

- D1 stores centroids, street ranges, and compact search indexes
- Full rows live in R2 shards by province/city/postal
- Runtime exact lookup fetches the appropriate shard

## Re-import

Without `--resume`, re-running import for a province deletes existing rows for that province and re-imports. Import metadata is preserved in `oda_imports`.

With `--resume`, existing address rows are kept, the CSV stream skips rows already stored, and centroids are rebuilt from the entire CSV when the run finishes.

If postal geocoding fails after an interrupted import, rebuild centroids without touching addresses:

```bash
npm run import:oda:centroids
# Or one province:
npm run import:oda -- --download --provinces AB --remote --skip-schema --centroids-only
```

Re-import QC or ON if `/api/oda/stats` shows unexpectedly low row counts (e.g. QC with only a handful of rows).

After any re-import or centroid rebuild, rebuild the autocomplete index for that province — it is
derived from the centroid tables and will otherwise serve stale streets:

```bash
npm run build:oda:suggest -- --provinces QC --remote --skip-schema
```
