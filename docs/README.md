# Riding Lookup Documentation

Guides for operating, extending, and integrating with the Riding Lookup API.

## Product & architecture

| Guide | Description |
|-------|-------------|
| [CONTEXT.md](../CONTEXT.md) | Glossary (Customer, keys, Billable unit, Fuse, Enterprise) |
| [ADRs](adr/) | Postgres/KV projection, DO ledger, hashed keys, dataset versioning |
| [Dataset changelog](DATASET_CHANGELOG.md) | Customer-facing vintage log |
| [Cache purge runbook](ops/cache-purge-runbook.md) | R2 upload → purge → warm → verify |
| [Alerts](ops/alerts.md) | 5xx / circuit-open Observability |
| [Suggest index staging](ops/suggest-index-staging.md) | Enable `/api/search` safely |
| [Portal](../portal/README.md) | Self-serve Customer app (Railway + CHS auth) |

## Operations

| Guide | Description |
|-------|-------------|
| [Go-live checklist](ops/go-live-checklist.md) | Infra/config steps before production (Worker, Stripe, portal, CI) |
| [Hosting decision](hosting.md) | Cloudflare Workers vs GCP migration notes |
| [Performance](performance.md) | Latency benchmarks, caching, and issue #8 optimizations |
| [OpenNorth comparison](comparison-opennorth.md) | Speed and robustness vs Represent API (complement for reps) |
| [Postal vs point lookup](postal-vs-point-lookup.md) | Why postal results differ from OpenNorth |
| [ODA data import](oda-data-import.md) | Download, import, resume, and verify StatCan ODA in D1; build the autocomplete index |

## ODA geocoding

| Guide | Description |
|-------|-------------|
| [API contract](oda-geolocation-contract.md) | Request/response shapes for ODA-backed geocoding, `/api/search` autocomplete, the `/embed.js` widget, and browser API keys |
| [Canada Post-style addresses](canada-post-style-addresses.md) | Normalization and mailing-field format |
| [Fixture examples](oda-fixtures.md) | Test addresses and expected behavior |

## Contributing

| Guide | Description |
|-------|-------------|
| [Contribution guidelines](CONTRIBUTING.md) | Dataset contributions and development workflow |
| [Improvements checklist](IMPROVEMENTS_CHECKLIST.md) | Historical feature and optimization tracker |

## Interactive API reference

When the worker is running locally or deployed:

| URL | Description |
|-----|-------------|
| `/` | Landing page with live lookup try-it widget |
| `/docs` | Interactive OpenAPI reference ([Scalar](https://scalar.com)) |
| `/swagger` | Alias of `/docs` |
| `/api/docs` | OpenAPI 3.0 JSON spec |

Local example: `http://localhost:8787/docs`
