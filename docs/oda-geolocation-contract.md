# ODA Geolocation API Contract

This document defines the public API contract for the self-hosted ODA (Open Database of Addresses) geolocation service integrated into ridingLookup.

## Overview

When `ODA_GEOCODING_ENABLED=true`, all address-to-coordinate resolution uses Statistics Canada's [Open Database of Addresses](https://www.statcan.gc.ca/en/lode/databases/oda) stored in Cloudflare D1. No external geocoding providers (GeoGratis, Google, Mapbox, Nominatim) are called.

Initial province coverage: **Ontario (ON)** and **Quebec (QC)**.

## Endpoints

### `GET /api/geocode`

Forward geocode: address, postal code, or city → coordinates.

**Query parameters** (same as riding lookup):

| Parameter | Description |
|-----------|-------------|
| `address` | Street address |
| `postal` or `postal_code` | Canadian postal code (A1A 1A1) |
| `city` | Municipality |
| `state` or `province` | Province abbreviation or name |
| `country` | Country (optional) |

At least one location parameter is required. Coordinates (`lat`/`lon`) are not accepted on this endpoint.

**Success response (200):**

```json
{
  "query": { "address": "123 Main St", "city": "Toronto", "state": "ON" },
  "point": { "lon": -79.3832, "lat": 43.6532 },
  "geocodeMethod": "exact",
  "confidence": 1.0,
  "matchedFields": ["civic", "street", "city", "province"],
  "normalizedAddress": "123 MAIN ST, TORONTO ON M5V 2T6, CANADA",
  "mailingAddress": {
    "line1": "123 MAIN ST",
    "municipality": "TORONTO",
    "province": "ON",
    "postalCode": "M5V 2T6",
    "country": "CANADA",
    "formattedSingleLine": "123 MAIN ST, TORONTO ON M5V 2T6, CANADA",
    "formattedMultiline": "123 MAIN ST\nTORONTO ON  M5V 2T6\nCANADA",
    "canadaPostCertified": false
  },
  "dataSource": {
    "provider": "statcan-oda",
    "version": "2021001",
    "province": "ON",
    "canadaPostCertified": false
  },
  "correlationId": "req_..."
}
```

**Geocode methods:**

| Method | Default confidence | Description |
|--------|-------------------|-------------|
| `exact` | 1.0 | Full civic + street + city/province or postal match |
| `postal_centroid` | 0.85 | Centroid of all addresses sharing a postal code |
| `street_interpolated` | 0.75 | Same street, civic interpolated or nearest civic |
| `city_centroid` | 0.45 | Centroid of all addresses in a city |
| `nearest_neighbor` | ≤ 0.7 | Bounded R-tree nearest-neighbor match |

### `GET /api/reverse`

Reverse geocode: coordinates → nearest ODA address.

**Query parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `lat` | Yes | Latitude (-90 to 90) |
| `lon` or `lng` or `long` | Yes | Longitude (-180 to 180) |

**Success response (200):**

```json
{
  "query": { "lat": 43.6532, "lon": -79.3832 },
  "point": { "lon": -79.3832, "lat": 43.6532 },
  "geocodeMethod": "nearest_neighbor",
  "confidence": 0.95,
  "distanceMeters": 12.4,
  "normalizedAddress": "123 MAIN ST, TORONTO ON M5V 2T6, CANADA",
  "mailingAddress": { "...": "..." },
  "dataSource": { "provider": "statcan-oda", "version": "2021001", "province": "ON", "canadaPostCertified": false },
  "correlationId": "req_..."
}
```

### `GET /api/normalize-address`

Address normalization only; returns Canada Post-style fields when an ODA match is found. Same query parameters as `/api/geocode`. Does not perform riding lookup.

### Existing riding endpoints

`GET /api`, `/api/federal`, `/api/on`, `/api/qc`, `/api/combined` accept the same query parameters. When ODA is enabled, geocoding uses ODA internally. Responses include optional geocode metadata (`geocodeMethod`, `confidence`, `mailingAddress`, `dataSource`).

## Error codes

| HTTP | Code | When |
|------|------|------|
| 400 | `INVALID_QUERY` | Missing or invalid query parameters |
| 404 | `NO_NEARBY_ADDRESS` | Reverse geocode: no address within `ODA_MAX_REVERSE_DISTANCE_METERS` (default 25 km) |
| 404 | `ADDRESS_NOT_FOUND` | Forward geocode: no match in loaded provinces |
| 404 | `PROVINCE_NOT_LOADED` | Query targets a province not yet imported |
| 422 | `AMBIGUOUS_LOCATION` | Street-only query with no city/province/postal; or > `ODA_MAX_AMBIGUOUS_MATCHES` plausible matches |
| 422 | `LOW_CONFIDENCE_GEOCODE` | Best match confidence below `ODA_MIN_CONFIDENCE` (default 0.6) |

**Error response format:**

```json
{
  "error": "Street-only queries require city, province, or postal code",
  "code": "AMBIGUOUS_LOCATION",
  "correlationId": "req_...",
  "timestamp": 1718323200000
}
```

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `ODA_GEOCODING_ENABLED` | `false` | Enable ODA geocoding |
| `ODA_PROVINCES` | `ON,QC` | Loaded province codes |
| `ODA_MIN_CONFIDENCE` | `0.6` | Minimum confidence to return a result |
| `ODA_NN_MAX_CANDIDATES` | `50` | Max candidates for nearest-neighbor ranking |
| `ODA_MAX_REVERSE_DISTANCE_METERS` | `25000` | Max distance for reverse geocode |
| `ODA_MAX_AMBIGUOUS_MATCHES` | `5` | Max plausible matches before refusing |

## Admin endpoints

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/oda/init` | POST | Basic | Initialize ODA schema |
| `/api/oda/stats` | GET | Basic | Row counts, import metadata |

## Related docs

- [Canada Post-style addresses](./canada-post-style-addresses.md)
- [ODA data import](./oda-data-import.md)
- [Fixture acceptance examples](./oda-fixtures.md)
