## CanCoder Cloudflare Worker

[![CI](https://github.com/chester-hill-solutions/riding-and-address/actions/workflows/ci.yml/badge.svg)](https://github.com/chester-hill-solutions/riding-and-address/actions/workflows/ci.yml)

A comprehensive API service for finding Canadian electoral district (riding) information using geographic coordinates or addresses. Built on Cloudflare Workers with advanced features including spatial indexing, batch processing, caching, and webhook notifications.

### Core Lookup Routes

The API provides lookup endpoints for different levels of government:

- `GET /api/federal` — Federal ridings (2024 boundaries)
- `GET /api` — Alias of `/api/federal` for backwards compatibility
- `GET /api/combined` — Convenience endpoint equivalent to federal lookup with `include_province=true` by default

### Provincial Coverage

| Province/Territory | Riding endpoint | Riding data | ODA geocoding |
|---------------------|-----------------|-------------|---------------|
| Ontario | `GET /api/on` | live | StatCan ODA |
| Quebec | `GET /api/qc` | live | StatCan ODA |
| British Columbia | `GET /api/bc` | live | StatCan ODA |
| Alberta | `GET /api/ab` | live | StatCan ODA |
| Nova Scotia | `GET /api/ns` | live | StatCan ODA |
| New Brunswick | `GET /api/nb` | live | StatCan ODA |
| Manitoba | `GET /api/mb` | live | StatCan ODA |
| Saskatchewan | `GET /api/sk` | live | StatCan ODA |
| Prince Edward Island | `GET /api/pe` | live | StatCan ODA |
| Northwest Territories | `GET /api/nt` | live | StatCan ODA |
| Newfoundland and Labrador | `GET /api/nl` | live | fallback geocoders |
| Nunavut | `GET /api/nu` | live | fallback geocoders |
| Yukon | `GET /api/yt` | live | fallback geocoders |

**Riding data** (`live`) means boundary GeoJSON is in R2. **ODA geocoding** uses [StatCan ODA v1.0](https://www.statcan.gc.ca/en/lode/databases/oda) in D1 for the listed provinces; NL, NU, and YT are not in ODA and use GeoGratis/Google fallbacks for address lookup.

### Query Parameters

Provide either coordinates or a geocodable address:

- `lat` and `lon` (or `lng` / `long`) — Geographic coordinates
- `address` or `postal` — Street address or postal code (e.g., `H2X 1Y4` or `M5V 2T6`)
- `city` — City name (optional, helps with geocoding)
- `state` or `province` — Province/state (optional)
- `country` — Country (optional, defaults to Canada)
- `include_province` — Optional boolean (`true`/`false`) to include matching provincial data in `province_data`
- `return` — Optional comma-separated list of extra response fields (see below)

#### Optional `include_province` flag

Request provincial riding data without changing the base federal lookup:

- `include_province=true` — include `province_data` when the federal result's `PROV_TERR` maps to a supported province
- `include_province=false` — omit provincial lookup (even on `/api/combined`)
- `/api/combined` defaults to `include_province=true` when the flag is omitted

#### Supported Provinces for `include_province`

When `include_province=true` is set on a federal lookup, the API will automatically resolve the matching provincial riding for any of the following provinces:

- Ontario (ON)
- Quebec (QC)
- British Columbia (BC)
- Alberta (AB)
- Nova Scotia (NS)
- New Brunswick (NB)
- Manitoba (MB)
- Saskatchewan (SK)
- Newfoundland and Labrador (NL)
- Prince Edward Island (PE)
- Northwest Territories (NT)
- Nunavut (NU)
- Yukon (YT)

The provincial dataset must be uploaded to R2 for this to work. See the Provincial Coverage matrix above.

#### Optional `return` selector

Filter optional response fields (comma-separated). When `return` is present, endpoint defaults such as `/api/combined` provincial data are not applied unless also requested via `include_province=true`.

| Token | Description |
|-------|-------------|
| `municipality` | Include `municipality` and `properties.MUNICIPALITY` when resolvable from ODA/Google address normalization |

Examples:

- `return=municipality` — municipality only (no implicit `province_data` on `/api/combined`)
- `include_province=true&return=municipality` — both provincial data and municipality

Rules:

- Unknown `return` tokens return `400 INVALID_QUERY`.
- Invalid `include_province` values return `400 INVALID_QUERY`.
- Omitting `return` keeps endpoint defaults (e.g. `/api/combined` includes `province_data`).

#### Examples:
- `GET /api?lat=45.5017&lon=-73.5673`
- `GET /api?include_province=true&postal=M5V2T6`
- `GET /api?include_province=true&return=municipality&address=123%20Main%20St&city=Toronto&province=ON`
- `GET /api/qc?address=350%20Rue%20St-Paul%20E,%20Montréal`
- `GET /api/on?postal=M5V2T6&return=municipality`
- `GET /api/combined?address=757%20Victoria%20Park&city=Toronto&province=ON`

#### Response Format:
```json
{
  "query": { "lat": 45.5017, "lon": -73.5673 },
  "point": { "lon": -73.5673, "lat": 45.5017 },
  "properties": { /* riding properties from GeoJSON feature, or null */ },
  "province_data": null,
  "municipality": "TORONTO"
}
```

`province_data` is included only when `include_province=true` (or by default on `/api/combined`). Top-level `municipality` and `properties.MUNICIPALITY` are included only when `return=municipality`.

### ODA Self-Hosted Geocoding

When enabled, address geocoding uses Statistics Canada's [Open Database of Addresses (ODA)](https://www.statcan.gc.ca/en/lode/databases/oda) stored in Cloudflare D1 — no external geocoding APIs required.

**Documentation:**
- [Documentation index](docs/README.md)
- [API contract](docs/oda-geolocation-contract.md)
- [Data import](docs/oda-data-import.md)
- [Canada Post-style addresses](docs/canada-post-style-addresses.md)
- [Fixture examples](docs/oda-fixtures.md)
- [Performance](docs/performance.md)
- [Hosting decision](docs/hosting.md)

**Endpoints:**
- `GET /api/geocode` — forward geocode (address/postal → coordinates)
- `GET /api/reverse` — reverse geocode (coordinates → nearest address)
- `GET /api/normalize-address` — Canada Post-style address normalization
- `GET /api/search` — as-you-type address autocomplete ([contract](docs/oda-geolocation-contract.md#get-apisearch))
- `GET /embed.js` — drop-in autocomplete widget for any form ([usage](docs/oda-geolocation-contract.md#get-embedjs--drop-in-widget))
- `POST /api/oda/init` — initialize ODA schema (admin)
- `GET /api/oda/stats` — import statistics (admin)

**Setup:**
```bash
wrangler d1 create oda-addresses
# Add ODA_DB binding to wrangler.jsonc (see wrangler.jsonc example)

# Initialize schema, then import (fixture for dev; --download for production)
npm run import:oda -- --file test/fixtures/oda/fixture.csv --provinces ON,QC --local

# Production: download all StatCan provinces and import to remote D1
npm run import:oda:all

# Or one province at a time (use --resume for long runs)
npm run import:oda -- --download --provinces AB,BC --remote --skip-schema --resume

# Optional: build the autocomplete index for /api/search.
# Derived entirely from tables the import already wrote, so this takes seconds,
# not hours, and is safe to re-run per province.
npm run build:oda:suggest -- --provinces ON --remote
```

See [docs/oda-data-import.md](docs/oda-data-import.md) for all import flags.

Set `ODA_GEOCODING_ENABLED = "true"` in `wrangler.jsonc` after import. `/api/search` is
gated separately by `ODA_SUGGEST_ENABLED`, which stays `"false"` until the suggest index is
built — while it is off, the route is not registered at all.

**Limitations:** ODA v1.0 is 2021 collection data. Coverage: AB, BC, MB, NB, NT, NS, ON, PE, QC, SK (10 provinces). NL, NU, and YT use fallback geocoders. Returned addresses are Canada Post-style but not Canada Post-certified.

### Advanced Features

#### Batch Processing
Process multiple lookups efficiently with automatic geocoding:

- `POST /batch` — Submit batch lookup requests
- `GET /batch/{batchId}` — Check batch processing status

**Batch Request Format:**
```json
{
  "requests": [
    { "id": "req1", "query": { "lat": 45.5017, "lon": -73.5673 } },
    { "id": "req2", "query": { "address": "123 Main St, Toronto, ON" } }
  ]
}
```

#### Queue Management
Distributed queue processing with Durable Objects:

- `POST /api/queue/submit` — Submit jobs to processing queue
- `GET /api/queue/status?jobId={id}` — Check job status  
- `POST /api/queue/process` — Trigger queue processing
- `GET /api/queue/stats` — View queue statistics

#### Monitoring & Health
Built-in monitoring and observability:

- `GET /health` — Service health check with metrics and circuit breaker status
- `GET /metrics` — Detailed performance metrics
- `GET /cache-warming` — Cache warming status and configuration

#### Spatial Database Integration
Optional D1 database backend for improved performance:

- `POST /api/database/init` — Initialize spatial database schema
- `POST /api/database/sync` — Sync GeoJSON data to database
- `GET /api/database/stats` — Database statistics
- `GET /api/database/query` — Direct database spatial queries

#### Boundaries API
Access riding boundary data directly:

- `GET /api/boundaries/lookup` — Get boundary geometry for a point
- `GET /api/boundaries/all` — List all boundaries with pagination
- `GET /api/boundaries/config` — Spatial indexing configuration

#### Webhook Support
Event-driven notifications for batch completion:

- `GET /api/webhooks` — List configured webhooks
- `POST /api/webhooks` — Create new webhook
- `PUT /api/webhooks/{id}` — Update webhook configuration
- `DELETE /api/webhooks/{id}` — Remove webhook
- `GET /api/webhooks/events` — View webhook event history
- `GET /api/webhooks/deliveries` — View delivery attempts

#### Documentation
Interactive API documentation:

- `GET /` — Landing page with live lookup try-it widget
- `GET /docs` — OpenAPI reference powered by [Scalar](https://scalar.com)
- `GET /swagger` — Alias of `/docs`
- `GET /api/docs` — OpenAPI specification (JSON)

Markdown guides live in [`docs/`](docs/README.md).

### Setup

#### 1) Install Wrangler and login
```bash
npm i -g wrangler
wrangler login
```

#### 2) Create R2 bucket for GeoJSON storage
```bash
wrangler r2 bucket create ridings
```

#### 3) Upload GeoJSON files to R2
Upload the boundary datasets with exact keys expected by the worker:
```bash
wrangler r2 object put ridings/federalridings-2024.geojson --file ./federalridings-2024.geojson
wrangler r2 object put ridings/quebecridings-2025.geojson --file ./quebecridings-2025.geojson
wrangler r2 object put ridings/ontarioridings-2022.geojson --file ./ontarioridings-2022.geojson
```

#### 4) Configure KV namespace for geocoding cache
```bash
wrangler kv:namespace create "GEOCODING_CACHE"
wrangler kv:namespace create "GEOCODING_CACHE" --preview
```
Update the namespace IDs in `wrangler.jsonc`.

#### 5) Configure Durable Objects for queue management
The `QUEUE_MANAGER` Durable Object is already configured in `wrangler.jsonc` and will be automatically deployed.

#### 6) Optional: Set up D1 database for spatial indexing
```bash
wrangler d1 create riding-lookup-db
```
Add the database binding to `wrangler.jsonc`:
```toml
[[d1_databases]]
binding = "RIDING_DB"
database_name = "riding-lookup-db"
database_id = "your-database-id"
```

#### 7) Configure geocoding providers (optional)

**Primary: GeoGratis** (no API key required)
- The service **always** uses GeoGratis Geolocation API first (https://geogratis.gc.ca/services/geolocation/en/locate)
- No configuration needed, works out of the box
- Automatically falls back to other providers if GeoGratis fails, returns `INTERPOLATED_POSITION`, or has poor scoring (< 0.5)

**Fallback Providers:**
The service falls back to the configured provider when GeoGratis is unavailable or returns low-quality results.

**Default Fallback: Nominatim** (no API key required)
- No configuration needed, works out of the box

**Mapbox Geocoding (Fallback):**
```bash
wrangler secret put MAPBOX_TOKEN
```
Set `GEOCODER = "mapbox"` in `wrangler.jsonc`.

**Google Maps Geocoding (Fallback):**
```bash
wrangler secret put GOOGLE_MAPS_KEY
```
Set `GEOCODER = "google"` in `wrangler.jsonc`.

*Alternative: Per-request API key*
You can pass the Google API key as a header `X-Google-API-Key` with each request instead of setting the environment variable. It supplies the key used for geocoding; it does **not** authenticate the request (see below).

#### 8) Configure authentication (optional)
Set basic authentication for admin endpoints:
```bash
wrangler secret put BASIC_AUTH
# Enter: username:password (will be base64 encoded automatically)
```

> **⚠️ Breaking change: `X-Google-API-Key` no longer bypasses basic auth.**
>
> Previously, *any* request carrying that header skipped `BASIC_AUTH` entirely — with any value at
> all. `curl -H 'X-Google-API-Key: garbage'` returned real data on every protected route, and
> because rate limits were bucketed on that same unvalidated header, rotating the value also
> walked around the rate limiter.
>
> The header's job is BYOK: supplying your own Google key for geocoding. Bringing a geocoding key
> is not the same as being authorized to use this service, so it no longer authenticates anything.
>
> **Clean break: there is no opt-out.** Callers relying on the old behaviour must send real
> credentials. Check your logs for `X-Google-API-Key` before deploying.

**Credentials for the chargeable product** (see [`CONTEXT.md`](CONTEXT.md)):

| Caller | Credential | Notes |
|--------|-----------|--------|
| Customer backend | Server key `sk_*` (`Authorization: Bearer`) | Lookup/geocode; hashed at rest; monthly Customer fuse |
| Browser widget | Browser key `pk_*` | `/api/search` + `/embed.js`; origin allowlist + daily cap; same Customer meter |
| Operator | `BASIC_AUTH` | Admin/ops only when `API_KEYS` is bound |
| Public demo | none | `/api/demo/*` IP-limited; not billable |

Self-serve portal + marketing share this Worker ([`portal/`](portal/), D1 `PORTAL_DB`).
Projection admin: `/admin/projection/*` (portal also projects in-process).

```bash
wrangler kv namespace create API_KEYS   # then uncomment the binding in portal/wrangler.jsonc
npm run keys -- customer create --id cust_acme --plan free --remote
npm run keys -- create-server --customer cust_acme --remote
npm run keys -- create-browser --customer cust_acme --origins "https://acme.com" --remote
```

#### 9) Set environment variables
Configure in `wrangler.jsonc` under `"vars"`:
```jsonc
{
  "vars": {
    "BATCH_SIZE": 50,                  // Maximum items per batch
    "BATCH_TIMEOUT": 30000,            // Batch request ceiling (ms)
    "GEOCODING_TIMEOUT": 10000,        // Single geocode chain budget (ms)
    "LOOKUP_TIMEOUT": 5000,            // Point-in-polygon lookup (ms)
    "TOTAL_TIMEOUT": 60000,            // Maximum total request time (ms)
    "RATE_LIMIT": 100,                 // Requests per minute per IP
    "GEOCODER": "google",              // Fallback geocoder: "nominatim" | "mapbox" | "google"
    "SPATIAL_DB_ENABLED": "false",     // Opt-in D1 R-tree pre-filter for lookups

    // ODA self-hosted geocoding — see docs/oda-geolocation-contract.md
    "ODA_GEOCODING_ENABLED": "true",
    "ODA_PROVINCES": "AB,BC,MB,NB,NT,NS,ON,PE,QC,SK",
    "ODA_MIN_CONFIDENCE": "0.6",       // Results below this are rejected
    "ODA_NN_MAX_CANDIDATES": "50",
    "ODA_MAX_REVERSE_DISTANCE_METERS": "25000",
    "ODA_MAX_AMBIGUOUS_MATCHES": "5",

    // Address autocomplete (/api/search). While disabled the route is not registered.
    "ODA_SUGGEST_ENABLED": "false",
    "ODA_SUGGEST_LIMIT": "7"           // Default suggestions returned
  }
}
```

Full list of `ODA_*` variables, including the optional autocomplete tuning knobs, is in
[docs/oda-geolocation-contract.md](docs/oda-geolocation-contract.md#configuration).

Postal-only fast path and `geocode_method=postal_centroid` are documented in [docs/postal-vs-point-lookup.md](docs/postal-vs-point-lookup.md).

### Develop and deploy

Config lives in [`portal/wrangler.jsonc`](portal/wrangler.jsonc) (combined portal SSR + API).

#### Local development
```bash
bun run dev
# or: cd portal && bun run db:migrate:local && bun run dev
```

#### Production deployment
```bash
bun run deploy
# builds portal + deploys the combined Worker
```

#### Initialize spatial database (optional)
After deployment, initialize the D1 spatial database:
```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/api/database/init \
  -H "Authorization: Basic $(echo -n 'username:password' | base64)"
```

#### Sync GeoJSON to database (optional)
```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/api/database/sync \
  -H "Authorization: Basic $(echo -n 'username:password' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"dataset": "federalridings-2024.geojson"}'
```

### Performance Features

#### Intelligent Caching
- **Multi-layer caching**: LRU caches for GeoJSON data, spatial indexes, and geocoding results
- **Automatic cache warming**: Cloudflare Cron Trigger every 6 hours (`0 */6 * * *` in `portal/wrangler.jsonc`)
- **Circuit breakers**: Automatic failover when external services are unavailable

**Note on Cron Trigger**: `wrangler.jsonc` schedules `0 */6 * * *`. Each run calls the Worker `scheduled` handler to (1) warm riding/lookup caches for common locations and (2) process pending webhook deliveries. It is unrelated to API key metering or Stripe.

#### Spatial Optimization
- **Spatial indexing**: Bounding box pre-filtering for faster point-in-polygon tests
- **D1 integration**: Optional database backend with R-tree spatial indexing
- **Ray casting algorithm**: Supports complex Polygon and MultiPolygon geometries

#### Rate Limiting & Security
- **IP-based rate limiting**: Configurable requests per minute
- **Basic authentication**: Secure admin endpoints with HTTP Basic Auth
- **Input validation**: Comprehensive parameter validation and sanitization

### Monitoring & Observability

#### Health Monitoring
The `/health` endpoint provides comprehensive service status:
- Circuit breaker states for external dependencies
- Cache performance metrics
- Processing latencies and error rates

#### Metrics Collection
Built-in metrics tracking:
- Request counts and error rates
- Geocoding performance (cache hits/misses, provider latencies)
- R2 storage performance
- Spatial database query performance
- Batch processing statistics

#### Error Handling
- Graceful degradation when external services fail
- Detailed error responses with correlation IDs
- Automatic retry with exponential backoff

### Architecture Notes

#### Cloudflare Workers Platform
- **Edge computing**: Low-latency responses from Cloudflare's global network
- **Serverless**: Automatic scaling with no infrastructure management
- **R2 Storage**: Object storage for large GeoJSON boundary files
- **KV Storage**: Low-latency cache for geocoding results
- **Durable Objects**: Stateful queue management and coordination
- **D1 Database**: Optional SQL database with spatial extensions

#### Scalability
- **Horizontal scaling**: Automatic scaling across Cloudflare's edge network  
- **Memory efficiency**: Optimized GeoJSON parsing and spatial indexing
- **Batch processing**: Efficient handling of bulk lookup requests
- **Queue management**: Distributed job processing with Durable Objects

#### Data Sources
- **Federal ridings**: 2024 electoral boundaries from Elections Canada
- **Quebec provincial**: 2025 electoral boundaries  
- **Ontario provincial**: 2022 electoral boundaries
- **Geocoding**: Primary service is GeoGratis Geolocation API (Government of Canada), with fallback to Nominatim, Mapbox, and Google Maps APIs
