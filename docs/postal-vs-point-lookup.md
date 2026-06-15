# Postal vs point-in-polygon lookup

Riding Lookup and [OpenNorth Represent](https://represent.opennorth.ca/) answer slightly different questions for the same postal code. Integrators comparing results should understand this before treating disagreements as bugs.

## How each API resolves a postal code

| Step | Riding Lookup | OpenNorth Represent |
|------|---------------|---------------------|
| Input | `?postal=M5V2T6` | `GET /postcodes/M5V2T6/?sets=federal-electoral-districts-2023-representation-order` |
| Geocoding | ODA postal centroid (or forward geocode), then **point-in-polygon** on **2024** federal boundaries | **Postal concordance / centroid** mapped to **2023** representation-order districts |
| Output | Riding at the geocoded point | Riding assigned to the postal area |

Riding Lookup is optimized for **“where does this location fall on the map?”** OpenNorth postal lookup is optimized for **“which district is this postal code generally associated with?”**

## Canonical example: `M5V2T6`

Downtown Toronto postal code `M5V2T6`:

| API | Federal riding |
|-----|----------------|
| Riding Lookup (default) | **University—Rosedale** |
| OpenNorth postal centroid | **Spadina—Harbourfront** |

Both are defensible. The geocoded centroid for `M5V2T6` falls in University—Rosedale on 2024 boundaries; Canada Post / concordance tables often associate the FSA with Spadina—Harbourfront.

See the full comparison: [comparison-opennorth.md](comparison-opennorth.md).

## Victoria Park: address vs postal

| Input | Riding Lookup | OpenNorth |
|-------|---------------|-----------|
| Address `757 Victoria Park` (geocoded point) | Scarborough Southwest | Scarborough Southwest (via `contains` on resolved lat/lon) |
| Postal `M4C1N2` only | Beaches—East York (postal centroid path) | Beaches—East York (postal centroid) |

Use a **civic address** when the building matters; use **postal only** when mail-based concordance is enough.

## OpenNorth parity mode

Pass `geocode_method=postal_centroid` to restrict geocoding to the ODA postal-centroid table (no civic forward geocode, no GeoGratis/Nominatim fallback):

```http
GET /api/federal?postal=M5V2T6&geocode_method=postal_centroid
```

Responses include a `geocode` object when metadata is available:

```json
{
  "riding": "University—Rosedale",
  "geocode": { "method": "postal_centroid", "confidence": 0.85 }
}
```

This mode is closest to OpenNorth postal semantics but still uses Riding Lookup boundary vintages (2024 federal).

## When results should match

- **Lat/lon lookups** — both use point-in-polygon (OpenNorth `contains=`).
- **Geocoded civic addresses** — compare OpenNorth `contains` on the same lat/lon.
- **Rural cross-boundary postcodes** (e.g. `K0A1K0`) — may differ even in parity mode due to centroid placement and boundary vintage.

## When to use which API

**Riding Lookup** — address → riding in one call, 2024 boundaries, optional provincial `/api/combined`, edge caching.

**OpenNorth** — representative names and emails, postal concordance workflows, unauthenticated public access.
