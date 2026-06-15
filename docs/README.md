# Riding Lookup Documentation

Guides for operating, extending, and integrating with the Riding Lookup API.

## Operations

| Guide | Description |
|-------|-------------|
| [Hosting decision](hosting.md) | Cloudflare Workers vs GCP migration notes |
| [Performance](performance.md) | Latency benchmarks, caching, and issue #8 optimizations |
| [OpenNorth comparison](comparison-opennorth.md) | Speed and robustness vs Represent API |
| [Postal vs point lookup](postal-vs-point-lookup.md) | Why postal results differ from OpenNorth |
| [ODA data import](oda-data-import.md) | Download, import, resume, and verify StatCan ODA in D1 |

## ODA geocoding

| Guide | Description |
|-------|-------------|
| [API contract](oda-geolocation-contract.md) | Request/response shapes for ODA-backed geocoding |
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
