# NAR Data Import (one city per day)

## Why

The address database was built from Statistics Canada's [Open Database of Addresses (ODA)](https://www.statcan.gc.ca/en/lode/databases/oda), whose collection period is **January–April 2021**. Statistics Canada's successor source is the [National Address Register (NAR)](https://www150.statcan.gc.ca/n1/en/catalogue/46260002) — catalogue 46-26-0002, semi-annual, released under the Statistics Canada Open Licence, with the same civic/mailing address shape.

The ODA importer (`docs/oda-data-import.md`) is **province-scoped**: without `--resume` it deletes an entire province and re-inserts, which is a 6–12 hour rewrite of millions of rows. The NAR importer is its **city-scoped** counterpart. It refreshes one municipality at a time, so the province can be migrated from the 2021 ODA to the current NAR a city per day without a single large rewrite and without leaving the province empty for hours.

Migration strategy: **replace a city's rows in place**. Refreshing "Toronto" deletes that city's ODA rows and writes the NAR rows, so after a refresh the city's data is NAR-sourced and the row set is never duplicated. Provenance is recorded per city and vintage.

## Source

| | |
|---|---|
| Catalogue | 46-26-0002 |
| Frequency | Semi-annual |
| Current release | **June 2026** (2026-06-26) |
| Archive | `https://www150.statcan.gc.ca/n1/pub/46-26-0002/2022001/202606.zip` (~1.67 GB) |
| Earlier vintages | `202512.zip`, `202507.zip`, `202412.zip`, `2024.zip`, … under the same path |
| Licence | Statistics Canada Open Licence |

The importer caches the archive at `.nar-import/<version>.zip` and extracts only the province it needs, deleting the extracted CSVs after the run. `--version` selects a different vintage; `--download` fetches it if it is not cached.

## Archive layout

A province is two split sets of CSVs, joined on `LOC_GUID`:

```
Addresses/Address_<numeric-code>[_part_N].csv   civic / street / mailing fields
Locations/Location_<numeric-code>[_part_N].csv   WGS84 coordinates
```

`<numeric-code>` is the StatCan province code (ON = 35, QC = 24, …). Large provinces are split into many parts (Ontario is 7 address parts and 5 location parts); every matching part is streamed in order. **The latitude/longitude are only in the `Locations/` files** — the address file carries projected `BG_X`/`BG_Y` and `BF_REPPOINT_X`/`BF_REPPOINT_Y` (EPSG:3347), not latitude/longitude. A refresh therefore makes three passes over the province:

1. stream the address parts, keep the rows whose municipality is in scope, collect their `LOC_GUID`s;
2. stream the location parts, keep coordinates for just those `LOC_GUID`s;
3. stream the address parts again, normalize with coordinates, and write.

Pass 2 only retains the locations actually referenced, so memory stays bounded by the city's size rather than the province's.

### Column mapping (NAR → oda_addresses)

| oda_addresses | NAR column |
|---|---|
| `province` | `MAIL_PROV_ABVN`, else `PROV_CODE` |
| `city` | `MAIL_MUN_NAME`, else `CSD_ENG_NAME` |
| `civic_number` | `CIVIC_NO` + `CIVIC_NO_SUFFIX` |
| `street_name` / `street_type` / `street_direction` | `MAIL_STREET_*`, else `OFFICIAL_STREET_*` |
| `unit` | `APT_NO_LABEL` |
| `postal_code` | `MAIL_POSTAL_CODE` |
| `lat` / `lon` | `BF_REPPOINT_LATITUDE`/`_LONGITUDE`, else `BG_LATITUDE`/`_LONGITUDE` (from `Locations/`) |

Mailing fields win over official fields because the runtime serves and matches the Canada Post form a caller types. `city_key`, `search_key` and `street_key` are built by the same functions the ODA importer uses, so a NAR city is indistinguishable from an ODA city to the lookup cascade.

**Coordinate preference is blockface (`BF_REPPOINT`) over building (`BG`)** because it is both the more complete and the more street-consistent of the two (measured on `Address_35_part_1`: 99.2% vs 93.5% of rows). This also matches how StatCan derives the ODA's coordinates. Rows with no resolvable coordinates are skipped and counted; they are never written with a null point (`lat`/`lon` are `NOT NULL`).

## City scope

`--city` is matched against the NAR `MAIL_MUN_NAME`, accent- and case-insensitively, **with the lookup-time alias map applied** (`src/oda-city-aliases.ts`). This matters because NAR still files Toronto's addresses under its six pre-amalgamation municipalities:

- `--city Toronto` matches `TORONTO`, `NORTH YORK`, `SCARBOROUGH`, `ETOBICOKE`, `YORK` and `EAST YORK`, and its delete scope covers all of them.
- `--city Quebec` matches `QUÉBEC` and also sweeps `QUEBEC CITY`, the ODA spelling.
- `--city Hamilton` sweeps `CITY OF HAMILTON`.

Refresh and query therefore agree on what a city is. A name that matches nothing is reported and **nothing is written**.

## What a refresh changes

For the scoped city keys, in order:

1. **Validates before any write.** It aborts (leaving data untouched) if no rows matched, or if the match count is less than 50% of the city's existing rows. `--force` overrides the shrinkage guard; `--dry-run` reports without writing.
2. **Deletes the previous rows** for the city keys from `oda_addresses` — only rows whose `id` predates the run, so a re-run cannot delete its own inserts.
3. **Rebuilds `oda_city_centroids` and `oda_street_ranges`** for the city keys from the NAR scan (deleted first, then re-inserted).
4. **Recomputes `oda_postal_centroids`** for the postal codes the run touched. Postal centroids are *not* city-scoped — a postal code can straddle a city line — so they are re-aggregated from the whole `oda_addresses` table rather than from the city slice. Postal codes that dropped out of the city are deleted.
5. **Rebuilds the autocomplete slice** (`oda_street_suggest` + `oda_suggest_fts`) for just the refreshed city keys, rather than the whole province. `--skip-suggest` opts out.
6. **Records provenance** in `nar_city_imports` (province, city key, NAR version, row count, timestamps). The table is created by this importer and is deliberately separate from `oda_imports` (province-scoped, hardcoded ODA version). It also writes `nar_city_keys` — one row per `city_key` the refresh covered, including the alias spellings such as `EAST YORK|ON` — which is what lets a lookup report `dataSource.provider = statcan-nar` with the vintage of the row it actually returned. `/api/oda/stats` exposes both under `narImports`.

### Availability window

Like the ODA importer, a refresh deletes before it inserts, so the city is served from a partially-loaded state while the run proceeds (typically tens of minutes for a large city). During that window a lookup falls through to the next method or an external geocoder rather than erroring. The alternative — insert-then-delete — would double-serve the city and can surface `AMBIGUOUS_LOCATION`, which is worse.

## Usage

```bash
# Toronto, writing to remote D1 (the run this pipeline was built for)
npm run import:nar -- --city Toronto --province ON --remote

# Read-only: fetch/scan/report, write nothing
npm run import:nar -- --city Toronto --province ON --remote --dry-run

# Next un-refreshed city from data/nar-cities.txt
npm run import:nar:next                 # = --next --remote

# Queue status
npm run import:nar -- --list

# Local, against a fixture that already carries lat/lon columns
npm run import:nar -- --city Toronto --province ON --local \
  --file test/fixtures/nar/fixture.csv
```

| Flag | Description |
|---|---|
| `--city <name>` | Municipality to refresh (required unless `--next`/`--list`) |
| `--province <PR>` | Two-letter province code (required with `--city`) |
| `--next` | Pick the first queue entry with no completed import for the vintage |
| `--list` | Print queue status against `nar_city_imports` |
| `--file <csv>` | Use a local address CSV (no Locations join; lat/lon must be in the row) |
| `--zip <path>` | Use a specific cached archive |
| `--version <YYYYMM>` | NAR vintage (default `202606`) |
| `--download` | Download the archive if not cached |
| `--remote` / `--local` | Target remote D1 or the local dev database |
| `--database <name>` | D1 database (default `oda-addresses`) |
| `--batch-size <n>` | Rows per `wrangler d1 execute` file (default 500) |
| `--max-rows <n>` | Sample mode: insert only, no delete/centroids. Refused with `--remote` unless `--force` |
| `--dry-run` | Scan and report; never write |
| `--force` | Override the shrinkage guard (and the `--max-rows` + `--remote` guard) |
| `--skip-schema` | Do not create `nar_city_imports` |
| `--skip-suggest` | Do not rebuild the city's autocomplete slice |
| `--keep-csv` | Keep extracted CSVs (default: delete after the run) |
| `--queue <path>` | Queue file (default `data/nar-cities.txt`) |

A pid lockfile at `.nar-import/import-nar.lock` refuses to start a second concurrent refresh — two runs would race on the same city's delete and insert. Delete the file only if the process it names is gone.

### Transport

`--remote` writes through Cloudflare's D1 `/query` API directly, using the account id from `CLOUDFLARE_ACCOUNT_ID` and a token from `CLOUDFLARE_API_TOKEN`, falling back to the wrangler OAuth session. This is deliberate: `wrangler d1 execute --file` goes through the bulk-import endpoint, which returned `7009 Upstream service unavailable` on every attempt during the first Toronto run, while `/query` stayed reliable and accepts a multi-statement body (1,000 realistic INSERTs per request, ~1s). `--batch-size` (default 500) sets statements per request. With no token, or under `--local`, it falls back to `wrangler d1 execute --file`. Set `ODA_DATABASE_ID` to skip the database-name lookup.

## Daily rotation

`data/nar-cities.txt` is the schedule: one `PROVINCE<TAB>City` per line, ordered by address count. `--next` refreshes the first entry that has no finished `nar_city_imports` row for the current vintage; a completed city is never repeated. Reorder or extend the file freely.

The checked-in queue is generated from the NAR itself, majors first:

```bash
# Active queue: everything with >= 10,000 addresses (222 cities, ~7 months at one/day)
npm run import:nar -- --discover-cities --provinces ALL --output data/nar-cities.txt --min-count 10000
```

`data/nar-cities.generated.txt` is the full discovered list down to 2,000 addresses (824 cities)
for later; re-run with a different `--min-count` to widen or narrow the rotation. Discovery folds
pre-amalgamation spellings to one city (`canonicalCityToken`), so the six Toronto names appear as a
single `Toronto` entry — but only for the aliases in `src/oda-city-aliases.ts`, so mailing
communities elsewhere (Nepean, Orleans, Kanata, …) remain separate entries until curated.

`scripts/nar-daily.sh` wraps the run for scheduling: it appends to a size-rotated log, exits
non-zero on failure, and POSTs a Slack-style `{"text": ...}` alert to `NAR_ALERT_WEBHOOK` when one
is set. Credentials come from `CLOUDFLARE_ACCOUNT_ID` (required) and `CLOUDFLARE_API_TOKEN`
(optional; otherwise the wrangler OAuth session is used).

**systemd** (recommended; units in `ops/`):

```bash
sudo install -m 0644 ops/nar-daily.service ops/nar-daily.timer /etc/systemd/system/
sudo install -d /etc/cancoder
sudo tee /etc/cancoder/nar-daily.env >/dev/null <<'EOF'
CLOUDFLARE_ACCOUNT_ID=<account>
NAR_ALERT_WEBHOOK=<optional slack-style webhook>
EOF
# Edit WorkingDirectory/ExecStart in the unit to your checkout path, then:
sudo systemctl daemon-reload && sudo systemctl enable --now nar-daily.timer
systemctl list-timers nar-daily.timer
```

The timer runs at 03:15 with `Persistent=true` (catches up if the machine was off) and a 15-minute
randomized delay.

**cron** alternative:

```cron
# Every day at 03:15 — refresh the next city from the NAR.
15 3 * * * CLOUDFLARE_ACCOUNT_ID=<account> /path/to/riding-and-address/scripts/nar-daily.sh
```

Wrangler must already be authenticated for the account that owns `oda-addresses`, and `CLOUDFLARE_ACCOUNT_ID` must be set when more than one account is available. Prefer a dedicated API token with D1 write scope for unattended runs over an interactive OAuth session.

The import is deliberately a local/CI job rather than a Worker cron: it parses gigabytes of CSV, which does not fit a Worker's CPU and duration limits. The Worker's existing 6-hourly cron is unrelated (cache warming and webhooks).

## Verifying

```bash
# Queue status
npm run import:nar -- --list

# Row counts for the city and its pre-amalgamation aliases
wrangler d1 execute oda-addresses --remote --command \
  "SELECT city_key, COUNT(*) FROM oda_addresses
   WHERE province='ON' AND city_key IN
     ('TORONTO|ON','NORTH YORK|ON','SCARBOROUGH|ON','ETOBICOKE|ON','YORK|ON','EAST YORK|ON')
   GROUP BY 1 ORDER BY 2 DESC;"

# Provenance
wrangler d1 execute oda-addresses --remote --command \
  "SELECT * FROM nar_city_imports ORDER BY finished_at DESC LIMIT 5;"
```

The suggest index's province-level staleness check (`GET /api/oda/stats` → `streetSuggestStaleProvinces`) compares street counts per province. A city refresh changes those counts, so the province will report stale until its whole suggest index is rebuilt — even though the refreshed city's slice is correct. Treat that flag as "province not yet fully rebuilt", not "the city is wrong".

## Limitations

- **Province coverage.** NAR includes NL, NU and YT, but lookups are gated on `ODA_PROVINCES` in `wrangler.jsonc`, so importing those provinces also requires adding them to that allowlist.
- **Growth.** NAR is larger than ODA (Ontario is ~6.3M addresses in the June 2026 release, versus ~4.0M ODA rows). A full national migration grows `oda-addresses` from ~3.47 GB toward ~5–6 GB, within D1's 10 GB per-database limit but worth watching. Converting a city replaces its rows, so only the currently-refreshed city's storage is transiently doubled.
- **Coordinates.** ~1% of NAR rows have no resolvable WGS84 point and are skipped rather than stored without a location.
