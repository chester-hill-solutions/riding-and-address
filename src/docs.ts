// Documentation and UI functions

import { getAllProvincialPaths, PROVINCIAL_DATASETS } from './datasets';

const PROVINCIAL_DATASET_STEMS = PROVINCIAL_DATASETS.map((d) => d.r2Key.replace(/\.geojson$/, ''));

export { createLandingPage } from './landing-page';

/**
 * Version of the Scalar bundle loaded from CDN by the API reference page.
 *
 * Must match the `@scalar/api-reference` devDependency in package.json — dependabot bumps that
 * one and cannot see this constant, so `test/docs.test.ts` asserts they agree.
 */
const SCALAR_API_REFERENCE_VERSION = "1.62.8";

export function createApiReference(baseUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CanCoder API Reference</title>
  <style>
    html, body {
      margin: 0;
      height: 100%;
    }
    #api-reference {
      height: 100%;
    }
  </style>
</head>
<body>
  <div id="api-reference"></div>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_API_REFERENCE_VERSION}"></script>
  <script>
    (function () {
      var openApiUrl = ${JSON.stringify(`${baseUrl}/api/docs`)};
      var lookupPaths = ['/api', '/api/federal', '/api/combined'].concat(${JSON.stringify(getAllProvincialPaths())});

      function hasLocationQuery(params) {
        if (params.get('postal') || params.get('address') || params.get('city')) {
          return true;
        }
        return Boolean(params.get('lat') && params.get('lon'));
      }

      function ensureLookupQuery(urlString) {
        var url = new URL(urlString, window.location.origin);
        if (lookupPaths.indexOf(url.pathname) === -1) {
          return urlString;
        }
        if (hasLocationQuery(url.searchParams)) {
          return urlString;
        }
        url.searchParams.set('postal', 'K1A 0A6');
        return url.toString();
      }

      var originalFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        try {
          if (typeof input === 'string') {
            return originalFetch(ensureLookupQuery(input), init);
          }
          if (input instanceof Request) {
            var nextUrl = ensureLookupQuery(input.url);
            if (nextUrl !== input.url) {
              input = new Request(nextUrl, input);
            }
          }
        } catch (_error) {
          // fall through to original fetch
        }
        return originalFetch(input, init);
      };

      Scalar.createApiReference('#api-reference', {
        url: openApiUrl,
        theme: 'default',
        layout: 'modern',
      });
    })();
  </script>
</body>
</html>`;
}

/** @deprecated Use createApiReference */
export function createSwaggerUI(baseUrl: string): string {
  return createApiReference(baseUrl);
}

const RETURN_QUERY_PARAMETER = {
  name: "return",
  in: "query" as const,
  description:
    "Optional comma-separated filter for expansion fields. Supported: municipality. When present, endpoint defaults (e.g. /api/combined province_data) are not applied unless include_province=true is also set.",
  required: false,
  schema: { type: "string", example: "municipality" },
};

const INCLUDE_PROVINCE_PARAMETER = {
  name: "include_province",
  in: "query" as const,
  description:
    "Optional flag (`true`/`false`). When true, include matching provincial data in province_data for any supported province. /api/combined defaults to true.",
  required: false,
  schema: { type: "string", enum: ["true", "false"], example: "true" },
};

const ALL_LOOKUP_PATHS = ['/api', '/api/federal', '/api/combined', ...getAllProvincialPaths()];

const LOOKUP_QUERY_PARAMETERS = [
  {
    name: "postal",
    in: "query" as const,
    description:
      "Canadian postal code (e.g., K1A 0A6). Alternatively provide address or lat/lon instead.",
    required: false,
    schema: { type: "string", default: "K1A 0A6", example: "K1A 0A6" },
  },
  {
    name: "address",
    in: "query" as const,
    description: "Street address",
    required: false,
    schema: { type: "string", default: "123 Main St, Toronto, ON", example: "123 Main St, Toronto, ON" },
  },
  {
    name: "lat",
    in: "query" as const,
    description: "Latitude (must be sent with lon)",
    required: false,
    schema: { type: "number", default: 45.4215, example: 45.4215 },
  },
  {
    name: "lon",
    in: "query" as const,
    description: "Longitude (must be sent with lat)",
    required: false,
    schema: { type: "number", default: -75.6972, example: -75.6972 },
  },
  {
    name: "city",
    in: "query" as const,
    description: "City name",
    required: false,
    schema: { type: "string", example: "Toronto" },
  },
  {
    name: "state",
    in: "query" as const,
    description: "Province or state",
    required: false,
    schema: { type: "string", example: "Ontario" },
  },
  {
    name: "country",
    in: "query" as const,
    description: "Country",
    required: false,
    schema: { type: "string", example: "Canada" },
  },
  INCLUDE_PROVINCE_PARAMETER,
  RETURN_QUERY_PARAMETER,
  {
    name: "dataset",
    in: "query" as const,
    description:
      "Optional dataset pin (R2 key id or year). Hard-fails with DATASET_UNAVAILABLE when it does not match the currently served vintage. Alias: pin.",
    required: false,
    schema: { type: "string", example: "federalridings-2024.geojson" },
  },
  {
    name: "geocode_method",
    in: "query" as const,
    description:
      "Accuracy mode. Default point-in-polygon after geocoding. Use postal_centroid for coarser postal-code centroid geocoding (documented dual-mode; not an electoral-authority warranty).",
    required: false,
    schema: { type: "string", enum: ["postal_centroid"], example: "postal_centroid" },
  },
];

const DATASET_RESPONSE_PROPERTY = {
  type: "object",
  description: "Dataset vintage served for this response (id/year). Pin mismatches return 404 DATASET_UNAVAILABLE.",
  properties: {
    id: { type: "string", example: "federalridings-2024.geojson" },
    year: { type: "integer", example: 2024 },
    name: { type: "string", example: "Federal" },
  },
};

const RETURN_RESPONSE_PROPERTIES = {
  province_data: {
    type: "object",
    nullable: true,
    description:
      "Provincial riding data when include_province=true and the federal result maps to a supported province",
    properties: {
      riding: { type: "string" },
      properties: { type: "object", nullable: true },
      dataset: { type: "string" },
    },
  },
  municipality: {
    type: "string",
    nullable: true,
    description: "Municipality when return includes municipality",
  },
  dataset: DATASET_RESPONSE_PROPERTY,
};

const ODA_GEOCODE_PARAMETERS = [
  { name: "address", in: "query", schema: { type: "string", default: "123 Main St, Toronto, ON" } },
  { name: "postal", in: "query", required: true, schema: { type: "string", default: "K1A 0A6", example: "K1A 0A6" } },
  { name: "city", in: "query", schema: { type: "string", default: "Ottawa" } },
  { name: "state", in: "query", schema: { type: "string", default: "ON" } },
];

const ODA_REVERSE_PARAMETERS = [
  { name: "lat", in: "query", required: true, schema: { type: "number", default: 45.4215, example: 45.4215 } },
  { name: "lon", in: "query", required: true, schema: { type: "number", default: -75.6972, example: -75.6972 } },
];

const ODA_NORMALIZE_PARAMETERS = [
  { name: "address", in: "query", schema: { type: "string", default: "123 Main St, Toronto, ON" } },
  { name: "postal", in: "query", required: true, schema: { type: "string", default: "K1A 0A6", example: "K1A 0A6" } },
];

const DEMO_TIER_NOTE =
  "Part of the public keyless demo tier: no Basic Auth and no API key. Requests are rate-limited " +
  "per client IP (DEMO_RATE_LIMIT, default 30) and are not billable. Any GET lookup route can be " +
  "tried by prefixing its path with /api/demo — including the provincial routes " +
  "(e.g. /api/demo/ontario); /api/demo alone aliases /api/demo/federal.";

/**
 * The keyless demo mirrors of the lookup and ODA geolocation endpoints. Deliberately no
 * `security` on any of them — being public is their entire point.
 */
function buildDemoEndpointSpecs(): Record<string, unknown> {
  const demoResponses = {
    "200": { description: "Same response shape as the mirrored authenticated endpoint" },
    "429": { description: "Demo rate limit exceeded (per client IP)" },
  };
  const demoLookup = (summary: string, mirror: string) => ({
    get: {
      summary,
      description: `Demo mirror of ${mirror}. ${DEMO_TIER_NOTE}`,
      tags: ["Demo"],
      parameters: LOOKUP_QUERY_PARAMETERS,
      responses: demoResponses,
    },
  });
  const demoOda = (summary: string, mirror: string, parameters: unknown[]) => ({
    get: {
      summary,
      description: `Demo mirror of ${mirror}. ${DEMO_TIER_NOTE}`,
      tags: ["Demo"],
      parameters,
      responses: demoResponses,
    },
  });
  return {
    "/api/demo/federal": demoLookup("Lookup federal riding by location (keyless demo)", "/api/federal"),
    "/api/demo/combined": demoLookup(
      "Lookup federal and provincial ridings in one call (keyless demo)",
      "/api/combined"
    ),
    "/api/demo/geocode": demoOda("Forward geocode using ODA (keyless demo)", "/api/geocode", ODA_GEOCODE_PARAMETERS),
    "/api/demo/reverse": demoOda("Reverse geocode using ODA (keyless demo)", "/api/reverse", ODA_REVERSE_PARAMETERS),
    "/api/demo/normalize-address": demoOda(
      "Normalize address to Canada Post-style format (keyless demo)",
      "/api/normalize-address",
      ODA_NORMALIZE_PARAMETERS
    ),
  };
}

function buildProvincialEndpointSpecs(): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  for (const dataset of PROVINCIAL_DATASETS) {
    const statusNote = dataset.status === 'registered'
      ? ' (registered — dataset upload to R2 pending)'
      : '';
    paths[dataset.path] = {
      get: {
        summary: `Lookup ${dataset.name} provincial riding by location`,
        description: `Find the ${dataset.name} provincial riding for a given location${statusNote}`,
        tags: ["Provincial Ridings"],
        parameters: LOOKUP_QUERY_PARAMETERS,
        responses: {
          "200": {
            description: "Successful lookup",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    query: { type: "object" },
                    point: {
                      type: "object",
                      properties: {
                        lon: { type: "number" },
                        lat: { type: "number" },
                      },
                    },
                    properties: {
                      type: "object",
                      nullable: true,
                    },
                    ...RETURN_RESPONSE_PROPERTIES,
                  },
                },
              },
            },
          },
        },
        security: [{ basicAuth: [] }, { apiKey: [] }],
      },
    };
  }
  return paths;
}

export function createOpenAPISpec(baseUrl: string) {
  return {
    openapi: "3.0.0",
    info: {
      title: "CanCoder API",
      description:
        "Canadian address geocoding, autocomplete, and electoral district API. Find federal, provincial, and territorial ridings by location. When ODA_GEOCODING_ENABLED is true, address geocoding uses Statistics Canada's Open Database of Addresses in D1; otherwise GeoGratis is tried first with fallback to Google Maps (BYOK), Mapbox, or Nominatim. Supports batch geocoding, lookup caching, and optional provincial riding enrichment. Built on Cloudflare Workers for global edge performance.",
      version: "1.0.0",
      contact: {
        name: "API Support",
        url: "https://github.com",
        email: "support@example.com",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: baseUrl,
        description: "Production server",
      },
    ],
    paths: {
      "/api": {
        get: {
          summary: "Lookup federal riding by location (alias)",
          description:
            "Alias of /api/federal. Find the federal riding for a given location using postal code, address, or coordinates",
          tags: ["Federal Ridings"],
          parameters: LOOKUP_QUERY_PARAMETERS,
          responses: {
            "200": {
              description: "Successful lookup",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      query: {
                        type: "object",
                        description: "The query parameters used",
                      },
                      point: {
                        type: "object",
                        properties: {
                          lon: { type: "number" },
                          lat: { type: "number" },
                        },
                        description: "Geocoded coordinates",
                      },
                      properties: {
                        type: "object",
                        description:
                          "Riding properties including FED_NUM, FED_NAME, etc.",
                        nullable: true,
                      },
                      ...RETURN_RESPONSE_PROPERTIES,
                    },
                  },
                  example: {
                    query: { postal: "K1A 0A6" },
                    point: { lon: -75.6972, lat: 45.4215 },
                    properties: {
                      FED_NUM: "35047",
                      FED_NAME: "Ottawa Centre",
                      PROV_TERR: "Ontario",
                    },
                  },
                },
              },
            },
            "400": {
              description: "Bad request - invalid parameters",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
            "401": {
              description: "Unauthorized - missing or invalid authentication",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
            "429": {
              description: "Rate limit exceeded",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      retryAfter: { type: "number" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/api/federal": {
        get: {
          summary: "Lookup federal riding by location",
          description:
            "Find the federal riding for a given location using postal code, address, or coordinates",
          tags: ["Federal Ridings"],
          parameters: LOOKUP_QUERY_PARAMETERS,
          responses: {
            "200": {
              description: "Successful lookup",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      query: {
                        type: "object",
                        description: "The query parameters used",
                      },
                      point: {
                        type: "object",
                        properties: {
                          lon: { type: "number" },
                          lat: { type: "number" },
                        },
                        description: "Geocoded coordinates",
                      },
                      properties: {
                        type: "object",
                        description:
                          "Riding properties including FED_NUM, FED_NAME, etc.",
                        nullable: true,
                      },
                      ...RETURN_RESPONSE_PROPERTIES,
                    },
                  },
                  example: {
                    query: { postal: "K1A 0A6" },
                    point: { lon: -75.6972, lat: 45.4215 },
                    properties: {
                      FED_NUM: "35047",
                      FED_NAME: "Ottawa Centre",
                      PROV_TERR: "Ontario",
                    },
                  },
                },
              },
            },
            "400": {
              description: "Bad request - invalid parameters",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
            "401": {
              description: "Unauthorized - missing or invalid authentication",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
            "429": {
              description: "Rate limit exceeded",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      retryAfter: { type: "number" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/api/combined": {
        get: {
          summary: "Lookup federal and provincial ridings in one call",
          description:
            "Returns the federal result plus the matching provincial result (Ontario or Quebec) in `province_data` when PROV_TERR maps to those provinces.",
          tags: ["Combined Lookup"],
          parameters: LOOKUP_QUERY_PARAMETERS,
          responses: {
            "200": {
              description: "Successful lookup (federal + optional provincial)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      query: { type: "object" },
                      point: {
                        type: "object",
                        properties: {
                          lon: { type: "number" },
                          lat: { type: "number" },
                        },
                      },
                      riding: { type: "string" },
                      properties: { type: "object", nullable: true },
                      province_data: {
                        type: "object",
                        nullable: true,
                        properties: {
                          riding: { type: "string" },
                          properties: { type: "object" },
                          dataset: {
                            type: "string",
                            enum: PROVINCIAL_DATASET_STEMS,
                          },
                        },
                      },
                      normalizedAddress: { type: "string" },
                      addressComponents: { type: "object" },
                    },
                  },
                  example: {
                    query: { address: "123 Main St, Toronto" },
                    point: { lon: -79.3832, lat: 43.6532 },
                    riding: "Toronto Centre",
                    properties: { FED_NUM: "35075", PROV_TERR: "Ontario" },
                    province_data: {
                      riding: "Toronto Centre",
                      properties: { PR_NUM: "082" },
                      dataset: "ontarioridings-2022",
                    },
                  },
                },
              },
            },
            "400": {
              description: "Bad request - invalid parameters",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
            "401": {
              description: "Unauthorized - missing or invalid authentication",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
            "429": {
              description: "Rate limit exceeded",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      retryAfter: { type: "number" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      ...buildProvincialEndpointSpecs(),
      ...buildDemoEndpointSpecs(),
      "/api/geocode": {
        get: {
          summary: "Forward geocode using ODA",
          description: "Geocode an address or postal code using the self-hosted ODA database. Requires ODA_GEOCODING_ENABLED.",
          tags: ["ODA Geolocation"],
          parameters: ODA_GEOCODE_PARAMETERS,
          responses: {
            "200": { description: "Geocode result with confidence and mailingAddress" },
            "422": { description: "AMBIGUOUS_LOCATION or LOW_CONFIDENCE_GEOCODE" },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/search": {
        get: {
          summary: "Address autocomplete (as-you-type)",
          description: [
            "Ranked address suggestions for a partial query, for use behind a search box.",
            "Requires ODA_SUGGEST_ENABLED; while it is off this path is not registered.",
            "",
            "Results come in two levels, told apart by `next`:",
            "",
            "- `next: \"search\"` — a **container**: either a street (`dataLevel: Street`) or a",
            "  building with many units (`dataLevel: Premise`, `unitCount`). The query is not",
            "  specific enough to name one address, so the set is returned with a count. Call this",
            "  endpoint again with `containerId` to drill in, or `cursor` to page.",
            "- `next: \"lookup\"` — a **resolved address** (`dataLevel: Premise`, or `RangedPremise`",
            "  when the civic number falls inside the street's range but has no exact record).",
            "  Take `location` and call `/api/federal` or `/api/combined` to get the riding.",
            "",
            "Suggestions never carry a riding: this endpoint reads only D1 and never loads",
            "boundary data. Riding is resolved once, for the address the user actually selects.",
          ].join("\n"),
          tags: ["ODA Geolocation"],
          parameters: [
            {
              name: "q",
              in: "query",
              required: true,
              description:
                "Partial address. Under 3 characters returns an empty list rather than an error.",
              schema: { type: "string", default: "250 main st tor", example: "250 main st tor" },
            },
            {
              name: "province",
              in: "query",
              description:
                "Comma-separated province codes to search. Defaults to ODA_PROVINCES. NL, NU and YT are not in the ODA dataset.",
              schema: { type: "string", example: "ON" },
            },
            {
              name: "limit",
              in: "query",
              description: "Maximum suggestions to return.",
              schema: { type: "integer", default: 7, minimum: 1, maximum: 20 },
            },
            {
              name: "containerId",
              in: "query",
              description:
                "Drill into a container: pass the `id` of a `next: \"search\"` suggestion. A street container lists its civic numbers; a building container lists its units.",
              schema: { type: "string" },
            },
            {
              name: "cursor",
              in: "query",
              description:
                "Page within a container: pass the previous response's `nextCursor`. Opaque keyset; absence of `nextCursor` means the last page.",
              schema: { type: "string" },
            },
            {
              name: "key",
              in: "query",
              description:
                "Browser API key (`pk_live_...`), required only when the API_KEYS binding is configured. Public by design: security comes from the key's server-side origin allowlist and daily cap, not from secrecy. May also be sent as `X-Api-Key`.",
              schema: { type: "string" },
            },
            {
              name: "locationBias",
              in: "query",
              description:
                "`lat,lon`. Soft: reorders results by proximity but never drops them. Mutually exclusive with locationRestriction.",
              schema: { type: "string", example: "43.65,-79.38" },
            },
            {
              name: "locationRestriction",
              in: "query",
              description:
                "`minLat,minLon,maxLat,maxLon`. Hard: excludes results outside the box. Mutually exclusive with locationBias.",
              schema: { type: "string", example: "43.5,-79.7,43.9,-79.1" },
            },
          ],
          responses: {
            "200": {
              description: "Ranked suggestions, best first",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      query: { type: "object" },
                      suggestions: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            text: { type: "string" },
                            structuredFormat: {
                              type: "object",
                              description: "mainText/secondaryText with match offsets for bolding.",
                            },
                            description: { type: "string" },
                            types: { type: "array", items: { type: "string" } },
                            next: { type: "string", enum: ["search", "lookup"] },
                            dataLevel: {
                              type: "string",
                              enum: ["Premise", "RangedPremise", "Street"],
                            },
                            location: { type: "object" },
                            cursor: {
                              type: "integer",
                              description: "Suggested caret position if this row is selected.",
                            },
                            score: { type: "number" },
                            addressCount: {
                              type: "integer",
                              description: "Containers only: how many addresses this container holds.",
                            },
                            unitCount: {
                              type: "integer",
                              description:
                                "Building containers only: distinct units sharing this civic. Counts real units, not duplicate records.",
                            },
                            civicRange: { type: "object" },
                            addressComponents: { type: "object" },
                            distanceMeters: { type: "integer" },
                          },
                        },
                      },
                      nextCursor: {
                        type: "string",
                        description:
                          "Present when the container has more rows than `limit`. Pass back as `cursor`; absence means the last page.",
                      },
                      provinces: {
                        type: "array",
                        items: { type: "string" },
                        description:
                          "Provinces actually searched, so an empty list can be told apart from a province with no data.",
                      },
                      dataSource: { type: "object" },
                      correlationId: { type: "string" },
                    },
                    example: {
                      query: { q: "main st tor", province: "ON", limit: 7 },
                      suggestions: [
                        {
                          id: "T04ACVRPUk9OVE98T04ATUFJTnxTVA",
                          text: "Main St, Toronto, ON",
                          structuredFormat: {
                            mainText: { text: "Main St", matches: [{ startOffset: 0, endOffset: 4 }] },
                            secondaryText: { text: "Toronto, ON" },
                          },
                          description: "Toronto, ON",
                          types: ["street", "container"],
                          next: "search",
                          dataLevel: "Street",
                          location: { lat: 43.6891, lon: -79.2989 },
                          cursor: 8,
                          score: 0.71,
                          addressCount: 250,
                          civicRange: { min: 1, max: 499 },
                        },
                      ],
                      provinces: ["ON"],
                      dataSource: { provider: "statcan-oda", version: "2021001" },
                      correlationId: "req_1784155868025_s13wy7bf6",
                    },
                  },
                },
              },
            },
            "400": { description: "INVALID_QUERY (missing q, unknown province, or both location hints), INVALID_CONTAINER_ID, or INVALID_CURSOR" },
            "401": { description: "KEY_REQUIRED, KEY_INVALID, or KEY_DISABLED when browser keys are enabled" },
            "403": { description: "ORIGIN_REQUIRED, ORIGIN_NOT_ALLOWED, WRONG_KEY_KIND, or CUSTOMER_NOT_FOUND" },
            "429": { description: "Rate limit exceeded, or DAILY_LIMIT_EXCEEDED for the key (resets 00:00 UTC)" },
            "503": { description: "SUGGEST_INDEX_MISSING — run npm run build:oda:suggest" },
          },
          // Either scheme works: server-to-server callers use Basic Auth; the embed widget and
          // other browser callers present a public pk_ key (see the `key` parameter above).
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/embed.js": {
        get: {
          summary: "Drop-in autocomplete widget",
          description: [
            "JavaScript widget that wires /api/search into an existing form. One script tag:",
            "",
            "    <script src='/embed.js' data-province='ON' defer></script>",
            "",
            "It finds the address field in each form, fills the address on selection, and emits",
            "the riding as a `ridinglookup:riding` event. Pass data-demo='true' (or attach({ demo: true }))",
            "to resolve via keyless /api/demo/* — used by the portal marketing try-it. Requires",
            "ODA_SUGGEST_ENABLED; 404s while off. See the API contract doc for the full options and events.",
          ].join("\n"),
          tags: ["ODA Geolocation"],
          responses: {
            "200": {
              description: "The widget source",
              content: { "application/javascript": { schema: { type: "string" } } },
            },
            "404": { description: "Address autocomplete is not enabled" },
          },
        },
      },
      "/api/reverse": {
        get: {
          summary: "Reverse geocode using ODA",
          tags: ["ODA Geolocation"],
          parameters: ODA_REVERSE_PARAMETERS,
          responses: {
            "200": { description: "Nearest ODA address with distanceMeters" },
            "404": { description: "NO_NEARBY_ADDRESS" },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/normalize-address": {
        get: {
          summary: "Normalize address to Canada Post-style format",
          tags: ["ODA Geolocation"],
          parameters: ODA_NORMALIZE_PARAMETERS,
          responses: { "200": { description: "Normalized mailing address" } },
          security: [{ basicAuth: [] }],
        },
      },
      "/batch": {
        post: {
          summary: "Process batch of lookup requests",
          description: "Process multiple lookup requests in a single call",
          tags: ["Batch Processing"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    requests: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          pathname: {
                            type: "string",
                            enum: ALL_LOOKUP_PATHS,
                          },
                          query: {
                            type: "object",
                            properties: {
                              postal: { type: "string" },
                              address: { type: "string" },
                              lat: { type: "number" },
                              lon: { type: "number" },
                              city: { type: "string" },
                              state: { type: "string" },
                              country: { type: "string" },
                              return: {
                                type: "string",
                                description: "Optional comma-separated extras: municipality",
                              },
                              include_province: {
                                type: "boolean",
                                description:
                                  "Optional boolean. When true, include matching provincial data in province_data",
                              },
                            },
                          },
                        },
                        required: ["id", "pathname", "query"],
                      },
                    },
                  },
                  required: ["requests"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Batch processing completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      results: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            query: { type: "object" },
                            point: { type: "object", nullable: true },
                            properties: { type: "object", nullable: true },
                            error: { type: "string" },
                            processingTime: { type: "number" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/health": {
        get: {
          summary: "Health Check",
          description:
            "Public liveness probe. Returns status and timestamp; detailed diagnostics require operator credentials and are not part of the public API.",
          tags: ["System"],
          responses: {
            "200": {
              description: "Health status retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: {
                        type: "string",
                        enum: ["healthy", "unhealthy"],
                      },
                      timestamp: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    // OpenAPI 3.0 requires securitySchemes under `components`. It previously sat here as a
    // sibling of `paths`, where it is silently ignored -- every `security: [{ basicAuth: [] }]`
    // on the paths above referenced a scheme the document never actually defined.
    components: {
      securitySchemes: {
        basicAuth: {
          type: "http",
          scheme: "basic",
        },
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "X-Google-API-Key",
          description: "Google Maps API key for BYOK authentication",
        },
      },
    },
    tags: [
      {
        name: "Federal Ridings",
        description: "Operations for federal riding lookups",
      },
      {
        name: "Combined Lookup",
        description: "Federal plus Ontario or Quebec provincial riding in one request",
      },
      {
        name: "Provincial Ridings",
        description: "Operations for provincial and territorial riding lookups",
      },
      {
        name: "ODA Geolocation",
        description:
          "Self-hosted geocoding and address autocomplete over the Statistics Canada Open Database of Addresses",
      },
      {
        name: "Demo",
        description:
          "Public keyless demo tier: /api/demo/* mirrors of the lookup and ODA geolocation endpoints, rate-limited per IP and not billable",
      },
      {
        name: "Batch Processing",
        description: "Batch processing operations",
      },
      {
        name: "System",
        description: "System health and monitoring endpoints",
      },
    ],
  };
}
