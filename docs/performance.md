# Performance (issue #8)

## Summary

| Path | Typical latency | vs OpenNorth (~130ms postal) |
|------|-----------------|------------------------------|
| Federal lookup, warm KV cache (lat/lon or cached postal) | **2–5ms** local | Faster |
| Combined lookup, warm cache | **3–6ms** local | Faster (extra provincial lookup) |
| Postal lookup, geocoding cache miss | **500ms–5s+** | Slower until geocoded |
| Postal lookup, after geocode + lookup cache warm | **2–5ms** | Faster |

OpenNorth resolves postcodes from a pre-built concordance table. This service geocodes first, then point-in-polygon. Once coordinates are cached in `LOOKUP_CACHE`, lookup latency is lower than OpenNorth for repeat queries.

## Benchmarks

```bash
# Spatial index micro-benchmark (offline, CI-safe)
npm run benchmark:lookup

# HTTP comparison vs OpenNorth (needs network + running worker)
npm run benchmark:lookup -- --http

# Against production
BENCHMARK_BASE_URL=https://your-worker.workers.dev npm run benchmark:lookup -- --http
```

## Optimizations

- **Lookup KV cache** — 24h TTL on federal/provincial results keyed by postal, address, or coordinates
- **Geocoding cache** — ODA / GeoGratis / fallback provider results in `GEOCODING_CACHE`
- **In-memory spatial index LRU** — GeoJSON loaded once per dataset per isolate
- **Cron cache warming** — preloads federal/provincial GeoJSON on a schedule
- **Deferred cache writes** — lookup KV `put` runs in `waitUntil` so responses are not blocked on write latency
- **Parallel expansion** — when both `return=municipality` and `include_province` are requested, province fetch and address normalization run concurrently

## Remaining gaps

- **Cold geocoding** — first postal lookup pays geocoding cost (ODA D1 when enabled, else GeoGratis/Google)
- **Cold R2** — first spatial lookup in an isolate loads GeoJSON from R2 (mitigated by cache warming)
- **Combined vs federal-only** — extra provincial lookup + optional normalization add work; still sub-10ms when cached

Track progress on [issue #8](https://github.com/chester-hill-solutions/riding-and-address/issues/8).
