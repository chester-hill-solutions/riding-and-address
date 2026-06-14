# Hosting Decision: Cloudflare Workers vs CHS GCP

## Current target

This service is implemented as a **Cloudflare Worker** with platform-native bindings:

- **R2** — GeoJSON riding boundary storage
- **KV** — geocoding and lookup result cache
- **D1** — ODA address database and optional spatial riding index
- **Durable Objects** — queue management and circuit breakers
- **Cron Triggers** — cache warming and webhook processing

The production deployment path is `wrangler deploy` using [`wrangler.jsonc`](../wrangler.jsonc).

## Why Cloudflare remains the implementation target

1. **Architecture fit** — spatial lookup, edge caching, and geocoding cache are already wired to Cloudflare primitives.
2. **Latency profile** — issue `#8` performance work targets warm edge lookups; Workers + KV cache align with that goal.
3. **Operational cost** — no separate compute layer to manage for the lookup API itself.

## If CHS GCP hosting is required

Treat GCP migration as a **separate project**, not a feature tweak. A migration would need replacements for:

| Cloudflare component | GCP equivalent (examples) |
|---------------------|---------------------------|
| Workers runtime | Cloud Run or GKE service |
| R2 ridings bucket | Cloud Storage |
| KV caches | Memorystore (Redis) or Firestore |
| D1 ODA / spatial DB | Cloud SQL (Postgres) or AlloyDB |
| Durable Objects | Cloud Tasks + Redis/Pub/Sub coordination |
| Cron Triggers | Cloud Scheduler |
| Wrangler secrets | Secret Manager |

Recommended approach:

1. Keep this repository on Cloudflare until parity tests and benchmarks are green.
2. Open a dedicated migration issue with infrastructure diagrams and cutover plan.
3. Extract lookup logic (`lookup-expansion`, `spatial`, `geocoding`) into runtime-agnostic modules before porting handlers.

## Issue `#5` resolution

Unless product explicitly requires GCP now, close `#5` as **deferred** with this document as the decision record and track GCP migration separately if needed.
