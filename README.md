## Riding Lookup Cloudflare Worker

A comprehensive API service for finding Canadian electoral district (riding) information using geographic coordinates or addresses. Built on Cloudflare Workers with advanced features including spatial indexing, batch processing, caching, and webhook notifications.

### Core Lookup Routes

The API provides lookup endpoints for different levels of government:

- `GET /api/federal` — Federal ridings (2024 boundaries)
- `GET /api` — Alias of `/api/federal` for backwards compatibility
- `GET /api/qc` — Quebec provincial ridings (2025 boundaries)  
- `GET /api/on` — Ontario provincial ridings (2022 boundaries)
- `GET /api/combined` — Federal result plus matching Ontario or Quebec provincial data in `province_data` when `PROV_TERR` indicates ON or QC (abbreviations and full names supported)

### Query Parameters

Provide either coordinates or a geocodable address:

- `lat` and `lon` (or `lng` / `long`) — Geographic coordinates
- `address` or `postal` — Street address or postal code (e.g., `H2X 1Y4` or `M5V 2T6`)
- `city` — City name (optional, helps with geocoding)
- `state` or `province` — Province/state (optional)
- `country` — Country (optional, defaults to Canada)

#### Examples:
- `GET /api?lat=45.5017&lon=-73.5673`
- `GET /api/qc?address=350%20Rue%20St-Paul%20E,%20Montréal`
- `GET /api/on?postal=M5V2T6`
- `GET /api?address=123%20Main%20St&city=Toronto&province=ON`

#### Response Format:
```json
{
  "query": { "lat": 45.5017, "lon": -73.5673 },
  "point": { "lon": -73.5673, "lat": 45.5017 },
  "properties": { /* riding properties from GeoJSON feature, or null */ }
}
```

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

- `GET /` — Interactive landing page with API explorer
- `GET /swagger` — Swagger UI interface
- `GET /api/docs` — OpenAPI specification (JSON)

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
Update the namespace IDs in `wrangler.toml`.

#### 5) Configure Durable Objects for queue management
The `QUEUE_MANAGER` Durable Object is already configured in `wrangler.toml` and will be automatically deployed.

#### 6) Optional: Set up D1 database for spatial indexing
```bash
wrangler d1 create riding-lookup-db
```
Add the database binding to `wrangler.toml`:
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
Set `GEOCODER = "mapbox"` in `wrangler.toml`.

**Google Maps Geocoding (Fallback):**
```bash
wrangler secret put GOOGLE_MAPS_KEY
```
Set `GEOCODER = "google"` in `wrangler.toml`.

*Alternative: Per-request API key*
You can pass the Google API key as a header `X-Google-API-Key` with each request instead of setting the environment variable. This bypasses basic authentication automatically.

#### 8) Configure authentication (optional)
Set basic authentication for admin endpoints:
```bash
wrangler secret put BASIC_AUTH
# Enter: username:password (will be base64 encoded automatically)
```

**Security Note: Authentication Bypass with Google API Key**
- If a request includes the `X-Google-API-Key` header, basic authentication is automatically bypassed
- This allows users to use their own Google Maps API key without needing the configured basic auth credentials
- **Important**: If a Google API key is compromised, the attacker will have full access to the API
- Consider implementing additional rate limiting or access controls per API key if needed

#### 9) Set environment variables
Configure in `wrangler.toml` under `[vars]`:
```toml
BATCH_SIZE = 50          # Maximum items per batch
BATCH_TIMEOUT = 30000    # Timeout in milliseconds  
RATE_LIMIT = 100         # Requests per minute per IP
```

### Develop and deploy

#### Local development
```bash
wrangler dev
```
The development environment uses remote R2 storage and KV for full feature testing.

#### Production deployment
```bash
wrangler deploy
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
- **Automatic cache warming**: Background cache warming every 6 hours (currently uses setInterval; consider migrating to Cloudflare Cron Triggers for production)
- **Circuit breakers**: Automatic failover when external services are unavailable

**Note on Cache Warming**: The current implementation uses `setInterval` for cache warming. For production deployments, consider using Cloudflare Cron Triggers by adding to `wrangler.toml`:
```toml
[triggers]
crons = ["0 */6 * * *"]  # Every 6 hours
```
Then handle the scheduled event in the worker's `scheduled` handler instead of using `setInterval`.

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
