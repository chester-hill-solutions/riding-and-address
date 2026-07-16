# ODA Geolocation API Contract

This document defines the public API contract for the self-hosted ODA (Open Database of Addresses) geolocation service integrated into ridingLookup.

## Overview

When `ODA_GEOCODING_ENABLED=true`, all address-to-coordinate resolution uses Statistics Canada's [Open Database of Addresses](https://www.statcan.gc.ca/en/lode/databases/oda) stored in Cloudflare D1. No external geocoding providers (GeoGratis, Google, Mapbox, Nominatim) are called.

Initial province coverage: **AB, BC, MB, NB, NT, NS, ON, PE, QC, SK** (StatCan [ODA v1.0](https://www.statcan.gc.ca/en/lode/databases/oda)). NL, NU, and YT are not available in ODA; those provinces use GeoGratis/Google fallback geocoding when ODA is enabled.

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

### `GET /api/search`

As-you-type address autocomplete. Gated by `ODA_SUGGEST_ENABLED`; while it is off, this path is
not registered and falls through to the standard riding lookup.

Requires the autocomplete index (`oda_street_suggest`, `oda_suggest_fts`). Build it with
`npm run build:oda:suggest` — see [Data import](./oda-data-import.md#autocomplete-index).

**Query parameters:**

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `q` | Yes | — | Partial address. Under 3 characters returns an empty list, not an error |
| `province` | No | `ODA_PROVINCES` | Comma-separated province codes to search |
| `limit` | No | `7` | Maximum suggestions (capped at `ODA_SUGGEST_MAX_LIMIT`) |
| `containerId` | No | — | Drill into a container: the `id` of a `next: "search"` suggestion |
| `cursor` | No | — | Page within a container: the previous response's `nextCursor` |
| `locationBias` | No | — | `lat,lon`. Soft — reorders by proximity, never drops results |
| `locationRestriction` | No | — | `minLat,minLon,maxLat,maxLon`. Hard — excludes results outside the box |

`locationBias` and `locationRestriction` are mutually exclusive.

#### Two levels: containers and addresses

The ODA dataset is civic addresses only — no business or place names. So a query like `main st tor`
does not identify one address, it identifies a *set*: every civic number on Main St in Toronto.
Rather than return an arbitrary sample of that set, `/api/search` returns the set itself as a
**container** carrying an `addressCount`, and lets the next keystroke narrow it. This mirrors
Canada Post AddressComplete's Find/Retrieve drill-down.

Read `next` to know what to do with a suggestion:

| `next` | `dataLevel` | Meaning | What to do |
|--------|-------------|---------|------------|
| `search` | `Street` | A street container — many addresses | Call `/api/search` again with `containerId` |
| `search` | `Premise` | A **building** container — one civic, many units (`unitCount`) | Drill in with `containerId` to list units |
| `lookup` | `Premise` | A real ODA address record | Use `location` |
| `lookup` | `RangedPremise` | Civic is inside the street's range but has no record; `location` is the **street centroid**, not the address | Use `location`, but treat it as approximate |

There is no retrieve step: suggestions carry `location` and `addressComponents` inline.

#### Units

A civic number that holds several units is returned as a **building container**, not as one of its
units. `560 Birchmount Rd` with 40 apartments comes back once, with `unitCount: 40` and
`next: "search"` — drill in to list the units, or type one to jump straight to it:

```
"560 birchmount rd"        → building container, unitCount 40, next=search
"205-560 birchmount rd"    → Premise, addressComponents.unit = "205"
"1503-560 birchmount rd"   → building container (no unit 1503 exists — find the right one)
```

Both Canadian unit forms parse: `205-560 Birchmount Rd` and `560 Birchmount Rd Unit 205`. Inside
a building container a bare trailing token filters units, so `560 Birchmount Rd 11` narrows to
110–116.

Two deliberate limits:

- **A building is only a building when units genuinely differ.** The count is of *distinct
  non-empty* units, not rows — ODA contains duplicate records for the same civic with no unit,
  and counting rows would turn those into a phantom two-unit tower.
- **We never invent a unit.** ODA has no unit data for most addresses. If you type a unit for a
  civic that has none recorded, you get the civic back and your unit stays in your own field —
  it is not echoed into `addressComponents` as though we had confirmed it.

#### Paging a large container

Yonge St has thousands of civics. Two ways through:

1. **Narrow** — keep typing. A civic filters within the container; this is the normal path and
   what `addressCount` is for (`"2100 addresses — keep typing"`).
2. **Page** — when a container has more rows than `limit`, the response carries `nextCursor`.
   Pass it back as `cursor` for the next page; its absence means the end.

```bash
curl "$BASE/api/search?q=yonge%20st&containerId=$CID"
#   -> { "suggestions": [...7...], "nextCursor": "eyJjaXZpY051bSI6MTA2..." }
curl "$BASE/api/search?q=yonge%20st&containerId=$CID&cursor=eyJjaXZpY051bSI6MTA2..."
```

The cursor is a keyset, not an offset: paging deep into a long street stays a single index seek
and cannot skip or repeat rows if the table changes underneath. Treat it as opaque.

#### Suggestions carry no riding

`/api/search` reads only D1 — it never loads boundary data and never runs point-in-polygon. That
is what keeps it fast enough for per-keystroke use, and it means **no suggestion includes a riding**.

Resolve the riding once, for the address the user actually selects, by passing its `location` to
the existing lookup endpoints:

```bash
# 1. User types; you show suggestions.
curl "$BASE/api/search?q=250%20main%20st%20tor&province=ON"
#    -> suggestions[0].location = { "lat": 43.6891, "lon": -79.2989 }

# 2. User selects. Now resolve the riding.
curl "$BASE/api/federal?lat=43.6891&lon=-79.2989"
#    -> { "properties": { "ENGLISH_NAME": "Toronto Centre", ... } }
```

Use `/api/combined?include_province=true` instead if you need the provincial riding too.

**Success response (200):**

```json
{
  "query": { "q": "main st tor", "province": "ON", "limit": 7 },
  "suggestions": [
    {
      "id": "T04ACVRPUk9OVE98T04ATUFJTnxTVA",
      "text": "Main St, Toronto, ON",
      "structuredFormat": {
        "mainText": { "text": "Main St", "matches": [{ "startOffset": 0, "endOffset": 4 }] },
        "secondaryText": { "text": "Toronto, ON" }
      },
      "description": "Toronto, ON",
      "types": ["street", "container"],
      "next": "search",
      "dataLevel": "Street",
      "location": { "lat": 43.6891, "lon": -79.2989 },
      "cursor": 8,
      "score": 0.71,
      "addressCount": 250,
      "civicRange": { "min": 1, "max": 499 }
    }
  ],
  "provinces": ["ON"],
  "dataSource": { "provider": "statcan-oda", "version": "2021001" },
  "correlationId": "req_..."
}
```

**Suggestion fields:**

| Field | Description |
|-------|-------------|
| `id` | Opaque. Pass back as `containerId` to drill into a container |
| `text` | Full single-line label |
| `structuredFormat` | `mainText`/`secondaryText`, each with `matches` offsets for bolding (`endOffset` exclusive) |
| `description` | Secondary line — locality and province |
| `types` | e.g. `["street","container"]` or `["address","premise"]` |
| `next` | `search` (drill in) or `lookup` (has a usable point) |
| `dataLevel` | `Street`, `Premise`, or `RangedPremise` |
| `location` | `{ lat, lon }` — feed to `/api/federal` to get the riding |
| `cursor` | Suggested caret position if this row is selected, so the user can keep typing |
| `score` | Rank score, higher is better |
| `addressCount` | Containers only. A number, not text — how many addresses this container holds |
| `unitCount` | Building containers only — how many distinct units share this civic |
| `civicRange` | Containers and `RangedPremise` — `{ min, max }` civic numbers |
| `addressComponents` | Address-level rows only |
| `distanceMeters` | Present only when `locationBias` was supplied |

**`provinces`** echoes what was actually searched, so an empty `suggestions` list can be told apart
from a province with no data. **NL, NU and YT are absent from ODA entirely** and will always return
nothing.

#### Ranking

Suggestions are scored on prefix quality (does the query prefix the street?), BM25 relevance,
popularity (`address_count` — busier streets are likelier intents), proximity to `locationBias`,
and whether a typed civic number falls inside the street's range. Ties break on `address_count`,
then alphabetically, so output is stable.

### `GET /embed.js` — drop-in widget

A framework-agnostic autocomplete widget that wires `/api/search` into an existing form. Served
by the worker and gated by the same `ODA_SUGGEST_ENABLED` flag (404 while off).

```html
<script src="https://your-worker.workers.dev/embed.js" data-province="ON" defer></script>
```

That is the whole integration. On load it finds the address field in each `<form>`, attaches, and
on selection fills the address fields and emits the riding.

**Script tag attributes:** `data-province`, `data-limit`, `data-include-province="true"`,
`data-endpoint`, `data-auto="false"` (disable auto-attach and use the API below).

**Field detection.** The standard `autocomplete` attribute wins, since it is an explicit
statement of intent; otherwise `name`/`id`/`placeholder`/`aria-label`/`<label>` are matched
against per-field patterns. Detection is deliberately conservative: it skips `address-line2`,
unit/apt, country, and email fields, and matches on word boundaries so `prov` matches but
`improve` does not.

Filling works on React/Vue controlled inputs: values are written through the prototype setter and
followed by real `input`/`change` events, so framework state actually updates instead of silently
reverting. A province `<select>` is matched on either the code (`ON`) or the full name
(`Ontario`).

**Explicit API**, for forms detection cannot read:

```js
const widget = RidingLookup.attach({
  form: '#checkout',
  input: '#addr1',                 // optional; auto-detected within `form`
  fields: {                        // any of these override detection
    city: '#city', province: '#prov', postal: '#pc',
    riding: '#riding_hidden'       // not auto-detected: bind it to have the riding written in
  },
  province: 'ON',
  includeProvince: false,          // true -> resolve via /api/combined
  fill: true,                      // false -> emit events only, touch nothing
  locationBias: { lat: 43.65, lon: -79.38 },
  onSelect(s) {}, onRiding(r) {}, onError(e) {}
});
widget.destroy();                  // restores the field exactly as found
```

**Events** bubble from the input, so one delegated listener covers every form on the page:

| Event | `detail` |
|-------|----------|
| `ridinglookup:select` | The chosen suggestion, fired for containers and addresses alike |
| `ridinglookup:riding` | `{ riding, properties, provinceData, point, suggestion }` |
| `ridinglookup:error` | `{ error }` |

```js
document.addEventListener('ridinglookup:riding', (e) => {
  console.log(e.detail.riding); // "Toronto Centre"
});
```

**Behaviour worth knowing:** selecting a street container does not close the dropdown — it drills
into that street and keeps searching within it, matching the two-level model above. Requests are
debounced (150 ms) and superseded ones are aborted, so a slow early keystroke can never overwrite
a later result. The dropdown renders in a shadow root, so host-page CSS cannot break it.

**Auth.** See below — the widget uses a public browser key, not `BASIC_AUTH`.

## Browser API keys

`/api/search` can require a **browser key**: a public identifier paired with a server-enforced
origin allowlist and a daily cap. This is the model Google and Canada Post both use, for the same
reason — a widget in a browser cannot hold a secret.

```html
<script src="https://your-worker.workers.dev/embed.js" data-key="pk_live_..." defer></script>
```

### Basic auth still works, from any domain

`/api/search` accepts **either** credential:

| Caller | Credential | Origin checked? | Daily cap? |
|--------|-----------|-----------------|------------|
| Your backend | `BASIC_AUTH` | No — any domain, or none at all | No |
| A browser widget | `pk_live_...` | Yes, per key | Yes |

Basic auth is checked first and deliberately skips both the origin allowlist and the cap. It is a
server-held secret rather than a public identifier, so binding it to a browser origin would be
meaningless — a backend sends no `Origin` header at all — and capping it would throttle your own
systems. This is the same split Google draws: web-service keys are secret and unrestricted;
browser keys are public and restricted.

When `BASIC_AUTH` is set but no key store is configured, `/api/search` requires basic auth like
every other route.

### The key is public. That is the design, not a flaw.

Anyone can read it from view-source. Loqate, Canada Post's parent, says so plainly: client-side
integrations *"don't hide your API keys, which means your keys are visible to anyone viewing the
source code of your website."* Google draws the same line — **web-service keys** are *"meant to
remain a shared secret between the developer's servers and Google"*, while browser keys are public
and restricted instead.

So security does not come from the key being secret. It comes from the origin check:

- **It stops** someone lifting your key onto their own site. Their browser reports their real
  origin and the server rejects it. That is the common case, and it works.
- **It does not stop** curl, which can send any `Origin` it likes. Anyone outside a browser is
  outside this model.

Be clear-eyed about that: this is an **accounting control, not an access control**. It keeps usage
attributable to your customers. It does not make the key exclusive. If you need secrecy, use
`BASIC_AUTH` from your own backend — that is the web-service-key half of the same split.

### Why there is a daily cap

Because a public key leaking is a *when*, not an *if*. Google's answer is that *"you are
financially responsible for charges caused by abuse of unrestricted API keys"*. Canada Post's
answer is a daily spend limit. The cap is the better idea: it turns an unbounded liability into a
bounded one, and it is the only control here that limits your downside.

Exactly `dailyLimit` requests succeed per UTC day; the rest get `429` with `Retry-After`. The
counter is a Durable Object, not KV — KV is eventually consistent and rate-limits writes to about
one per second per key, so a KV counter would both undercount and throttle. It **fails open** if
the counter is unavailable: the cap bounds cost, and a counter outage should degrade billing
accuracy rather than take search down. The origin check still applies regardless.

### Turning it on

Off by default. While the `API_KEYS` binding is absent, `/api/search` is open and no key is
required, so deploying this code changes nothing on its own.

```bash
wrangler kv namespace create API_KEYS      # then uncomment the binding in wrangler.jsonc
npm run keys -- create --label "Acme" --origins "https://acme.com,https://*.acme.com" --daily 50000 --remote
npm run keys -- list --remote
npm run keys -- revoke pk_live_... --remote
```

### Origin matching

Follows Google's wildcard semantics.

| Pattern | Matches | Does not match |
|---------|---------|----------------|
| `https://acme.com` | `https://acme.com` | `http://acme.com`, `https://acme.com:8443`, `https://app.acme.com` |
| `https://*.acme.com` | `https://app.acme.com`, `https://a.b.acme.com` | `https://acme.com`, `https://notacme.com`, `https://acme.com.evil.tld` |
| `*` | anything | — (unattributable; only the daily cap bounds abuse) |

Scheme and port must match exactly. **Paths are not supported** — Google warns that full-path
referrers are unreliable because browsers strip the path from cross-origin requests, and `Origin`
never carries one anyway.

We check `Origin`, not `Referer`. Google uses `Referer` for historical reasons and their docs are
full of caveats about it being stripped for privacy; `Origin` cannot be forged by page JS and is
sent reliably on the cross-origin fetches this key is for.

**A request with no `Origin` is denied** (`ORIGIN_REQUIRED`). A real browser always sends one on
these requests. Google leaves this case undocumented; we fail closed rather than leave an
origin-restricted key a hole any non-browser client can walk through.

### `/embed.js` is deliberately not gated

The script serves to anyone, with or without a key. Neither Google nor Canada Post gates the
script either — Google's loader carries the key openly in its URL. Gating public JS buys nothing
and costs CDN cacheability. The API calls are the resource; those are gated.

### Key errors

| HTTP | Code | When |
|------|------|------|
| 401 | `KEY_REQUIRED` | Keys are enabled and none was supplied |
| 401 | `KEY_INVALID` | No such key |
| 401 | `KEY_DISABLED` | Key revoked |
| 403 | `ORIGIN_REQUIRED` | No `Origin` header |
| 403 | `ORIGIN_NOT_ALLOWED` | Origin is not on this key's allowlist (the message names it, as Canada Post's does) |
| 429 | `DAILY_LIMIT_EXCEEDED` | Daily cap reached; resets 00:00 UTC |

Denials carry **no CORS headers** — echoing a rejected origin back would let the offending page
read the response and undercut the check that just failed.

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
| 400 | `INVALID_CONTAINER_ID` | `/api/search`: `containerId` is malformed |
| 400 | `INVALID_CURSOR` | `/api/search`: `cursor` is malformed |
| 503 | `ODA_NOT_ENABLED` | `/api/search`: `ODA_DB` is not bound |
| 503 | `SUGGEST_INDEX_MISSING` | `/api/search`: the suggest index has not been built — run `npm run build:oda:suggest` |

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

### Autocomplete (`/api/search`)

Independent of `ODA_GEOCODING_ENABLED`: autocomplete needs only `ODA_DB` and the suggest index,
so it can run whether or not the geocoding cascade is on.

| Env var | Default | Description |
|---------|---------|-------------|
| `ODA_SUGGEST_ENABLED` | `false` | Register `GET /api/search`. While `false` the route does not exist |
| `ODA_SUGGEST_LIMIT` | `7` | Default suggestions returned |
| `ODA_SUGGEST_MAX_LIMIT` | `20` | Ceiling for `?limit=` |
| `ODA_SUGGEST_MIN_QUERY_LENGTH` | `3` | Shorter queries return an empty list without querying D1 |
| `ODA_SUGGEST_CANDIDATE_WINDOW` | `50` | Rows pulled from the index before scoring |
| `ODA_SUGGEST_CACHE_TTL` | `3600` | KV cache TTL in seconds |

## Observability

`/api/search` reports into `GET /metrics` alongside every other endpoint:

| Metric | Meaning |
|--------|---------|
| `suggestRequests` | Total requests |
| `suggestCacheHits` / `suggestCacheMisses` | KV cache effectiveness |
| `suggestEmptyResults` | Queries over the min length that matched nothing |
| `suggestErrors` | Failures (e.g. the index not built) |
| `suggestKeyDenials` | Rejected keys, origins, or exhausted daily caps |
| `totalSuggestTime` | Cumulative time, for an average |

**`suggestEmptyResults` is the one to watch.** An empty result is a perfectly good `200`, so a
missing or stale index looks completely healthy from status codes alone — a rising empty rate is
the only signal that the data is wrong rather than the query.

Measure latency against a deployed worker with:

```bash
BENCHMARK_BASE_URL=https://your-worker.workers.dev npm run benchmark:lookup -- --suggest
```

It asserts a p95 budget (default 100ms) and exits non-zero if any scenario misses.

## Admin endpoints

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/oda/init` | POST | Basic | Initialize ODA schema |
| `/api/oda/stats` | GET | Basic | Row counts, import metadata |

## Related docs

- [Canada Post-style addresses](./canada-post-style-addresses.md)
- [ODA data import](./oda-data-import.md)
- [Fixture acceptance examples](./oda-fixtures.md)
