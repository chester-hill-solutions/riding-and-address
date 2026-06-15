// Documentation and UI functions

import { getAllProvincialPaths, getAllR2Keys, PROVINCIAL_DATASETS } from './datasets';

const RIDING_DATASET_KEYS = getAllR2Keys();
const PROVINCIAL_DATASET_STEMS = PROVINCIAL_DATASETS.map((d) => d.r2Key.replace(/\.geojson$/, ''));

export { createLandingPage } from './landing-page';

/** Keep in sync with devDependency `@scalar/api-reference` in package.json */
const SCALAR_API_REFERENCE_VERSION = "1.59.3";

export function createApiReference(baseUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Riding Lookup API Reference</title>
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
];

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
};

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
      title: "Riding Lookup API",
      description:
        "Find Canadian federal, provincial, and territorial ridings by location. When ODA_GEOCODING_ENABLED is true, address geocoding uses Statistics Canada's Open Database of Addresses in D1; otherwise GeoGratis is tried first with fallback to Google Maps (BYOK), Mapbox, or Nominatim. Supports batch geocoding, lookup caching, and optional provincial riding enrichment. Built on Cloudflare Workers for global edge performance.",
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
      "/api/geocode": {
        get: {
          summary: "Forward geocode using ODA",
          description: "Geocode an address or postal code using the self-hosted ODA database. Requires ODA_GEOCODING_ENABLED.",
          tags: ["ODA Geolocation"],
          parameters: [
            { name: "address", in: "query", schema: { type: "string", default: "123 Main St, Toronto, ON" } },
            { name: "postal", in: "query", required: true, schema: { type: "string", default: "K1A 0A6", example: "K1A 0A6" } },
            { name: "city", in: "query", schema: { type: "string", default: "Ottawa" } },
            { name: "state", in: "query", schema: { type: "string", default: "ON" } },
          ],
          responses: {
            "200": { description: "Geocode result with confidence and mailingAddress" },
            "422": { description: "AMBIGUOUS_LOCATION or LOW_CONFIDENCE_GEOCODE" },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/reverse": {
        get: {
          summary: "Reverse geocode using ODA",
          tags: ["ODA Geolocation"],
          parameters: [
            { name: "lat", in: "query", required: true, schema: { type: "number", default: 45.4215, example: 45.4215 } },
            { name: "lon", in: "query", required: true, schema: { type: "number", default: -75.6972, example: -75.6972 } },
          ],
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
          parameters: [
            { name: "address", in: "query", schema: { type: "string", default: "123 Main St, Toronto, ON" } },
            { name: "postal", in: "query", required: true, schema: { type: "string", default: "K1A 0A6", example: "K1A 0A6" } },
          ],
          responses: { "200": { description: "Normalized mailing address" } },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/oda/init": {
        post: {
          summary: "Initialize ODA database schema",
          tags: ["ODA Admin"],
          responses: { "200": { description: "Schema initialized" } },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/oda/stats": {
        get: {
          summary: "ODA database statistics",
          tags: ["ODA Admin"],
          responses: { "200": { description: "Row counts and import metadata" } },
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
      "/api/queue/submit": {
        post: {
          summary: "Submit Batch to Queue",
          description:
            "Submit a batch of riding lookups to the persistent queue for asynchronous processing. Returns immediately with batch ID for status tracking.",
          tags: ["Queue Operations"],
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
              description: "Batch submitted successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      batchId: { type: "string" },
                      status: { type: "string" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/api/queue/status": {
        get: {
          summary: "Get Batch Status",
          description:
            "Check the status of a submitted batch job including completion progress and results.",
          tags: ["Queue Operations"],
          parameters: [
            {
              name: "batchId",
              in: "query",
              description: "The batch ID returned from queue submission",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Batch status retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      batchId: { type: "string" },
                      status: {
                        type: "string",
                        enum: ["pending", "processing", "completed", "failed"],
                      },
                      progress: {
                        type: "object",
                        properties: {
                          total: { type: "number" },
                          completed: { type: "number" },
                          failed: { type: "number" },
                          pending: { type: "number" },
                        },
                      },
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
                      createdAt: { type: "string", format: "date-time" },
                      updatedAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/api/queue/stats": {
        get: {
          summary: "Get Queue Statistics",
          description:
            "Get comprehensive statistics about the queue including job counts, processing times, and success rates.",
          tags: ["Queue Operations"],
          responses: {
            "200": {
              description: "Queue statistics retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      totalBatches: { type: "number" },
                      pendingBatches: { type: "number" },
                      processingBatches: { type: "number" },
                      completedBatches: { type: "number" },
                      failedBatches: { type: "number" },
                      totalJobs: { type: "number" },
                      pendingJobs: { type: "number" },
                      completedJobs: { type: "number" },
                      failedJobs: { type: "number" },
                      averageProcessingTime: { type: "number" },
                      successRate: { type: "number" },
                      lastUpdated: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/api/queue/process": {
        post: {
          summary: "Process Queue Jobs",
          description:
            "Process pending jobs from the queue. This endpoint is typically called by worker processes.",
          tags: ["Queue Operations"],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    maxJobs: {
                      type: "number",
                      description:
                        "Maximum number of jobs to process (default: 10)",
                      default: 10,
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Queue processing completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      processed: { type: "number" },
                      successful: { type: "number" },
                      failed: { type: "number" },
                      results: { type: "array" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/api/database/init": {
        post: {
          summary: "Initialize Spatial Database",
          description:
            "Initialize the spatial database with required tables and indexes",
          tags: ["Database Operations"],
          responses: {
            "200": {
              description: "Database initialization completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/database/sync": {
        post: {
          summary: "Sync GeoJSON to Database",
          description: "Synchronize GeoJSON data to the spatial database",
          tags: ["Database Operations"],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    dataset: {
                      type: "string",
                      enum: RIDING_DATASET_KEYS,
                      default: "federalridings-2024.geojson",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Database sync completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      dataset: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/database/stats": {
        get: {
          summary: "Get Database Statistics",
          description: "Get statistics about the spatial database",
          tags: ["Database Operations"],
          responses: {
            "200": {
              description: "Database statistics retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      enabled: { type: "boolean" },
                      features: { type: "number" },
                      lastSync: {
                        type: "string",
                        format: "date-time",
                        nullable: true,
                      },
                      status: { type: "string", enum: ["active", "disabled"] },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/database/query": {
        get: {
          summary: "Query Database Directly",
          description: "Query the spatial database directly by coordinates",
          tags: ["Database Operations"],
          parameters: [
            {
              name: "lat",
              in: "query",
              description: "Latitude",
              required: true,
              schema: { type: "number", example: 45.4215 },
            },
            {
              name: "lon",
              in: "query",
              description: "Longitude",
              required: true,
              schema: { type: "number", example: -75.6972 },
            },
            {
              name: "dataset",
              in: "query",
              description: "Dataset to query",
              required: false,
              schema: {
                type: "string",
                enum: RIDING_DATASET_KEYS,
                default: "federalridings-2024.geojson",
              },
            },
          ],
          responses: {
            "200": {
              description: "Database query successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      type: { type: "string" },
                      properties: { type: "object" },
                      geometry: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/boundaries/lookup": {
        get: {
          summary: "Lookup Boundaries by Coordinates",
          description:
            "Find boundaries using coordinates with optional dataset selection",
          tags: ["Boundaries"],
          parameters: [
            {
              name: "lat",
              in: "query",
              description: "Latitude",
              required: true,
              schema: { type: "number", example: 45.4215 },
            },
            {
              name: "lon",
              in: "query",
              description: "Longitude",
              required: true,
              schema: { type: "number", example: -75.6972 },
            },
            {
              name: "dataset",
              in: "query",
              description: "Dataset to search",
              required: false,
              schema: {
                type: "string",
                enum: RIDING_DATASET_KEYS,
                default: "federalridings-2024.geojson",
              },
            },
          ],
          responses: {
            "200": {
              description: "Boundaries lookup successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      riding: { type: "string" },
                      properties: { type: "object" },
                      source: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/boundaries/all": {
        get: {
          summary: "Get All Boundaries",
          description: "Get all boundaries from the database with pagination",
          tags: ["Boundaries"],
          parameters: [
            {
              name: "dataset",
              in: "query",
              description: "Dataset to retrieve",
              required: false,
              schema: {
                type: "string",
                enum: RIDING_DATASET_KEYS,
                default: "federalridings-2024.geojson",
              },
            },
            {
              name: "limit",
              in: "query",
              description: "Number of results to return",
              required: false,
              schema: {
                type: "number",
                default: 100,
                minimum: 1,
                maximum: 1000,
              },
            },
            {
              name: "offset",
              in: "query",
              description: "Number of results to skip",
              required: false,
              schema: { type: "number", default: 0, minimum: 0 },
            },
          ],
          responses: {
            "200": {
              description: "Boundaries retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      features: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            type: { type: "string" },
                            properties: { type: "object" },
                            geometry: { type: "object" },
                          },
                        },
                      },
                      total: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/boundaries/config": {
        get: {
          summary: "Get Boundaries Configuration",
          description:
            "Get configuration information for boundaries processing",
          tags: ["Boundaries"],
          responses: {
            "200": {
              description: "Boundaries configuration retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      enabled: { type: "boolean" },
                      useRtreeIndex: { type: "boolean" },
                      batchInsertSize: { type: "number" },
                      datasets: {
                        type: "array",
                        items: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/geocoding/batch/status": {
        get: {
          summary: "Get Geocoding Batch Status",
          description:
            "Get status and configuration of batch geocoding functionality",
          tags: ["Geocoding"],
          responses: {
            "200": {
              description: "Geocoding batch status retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      enabled: { type: "boolean" },
                      maxBatchSize: { type: "number" },
                      timeout: { type: "number" },
                      retryAttempts: { type: "number" },
                      fallbackToIndividual: { type: "boolean" },
                      hasGoogleApiKey: { type: "boolean" },
                      timestamp: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/cache/warm": {
        post: {
          summary: "Trigger Cache Warming",
          description: "Manually trigger cache warming for specified locations",
          tags: ["Cache Management"],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    locations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          lat: { type: "number" },
                          lon: { type: "number" },
                          postal: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Cache warming initiated",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      locations: { type: "number" },
                      timestamp: { type: "number" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/webhooks": {
        get: {
          summary: "List Webhooks",
          description: "Get list of all configured webhooks",
          tags: ["Webhook Management"],
          responses: {
            "200": {
              description: "Webhooks list retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      webhooks: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            url: { type: "string" },
                            events: {
                              type: "array",
                              items: { type: "string" },
                            },
                            secret: { type: "string", nullable: true },
                            createdAt: { type: "number" },
                            lastDelivery: { type: "number", nullable: true },
                            failureCount: { type: "number" },
                            maxFailures: { type: "number" },
                            active: { type: "boolean" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }],
        },
        post: {
          summary: "Create Webhook",
          description: "Create a new webhook configuration",
          tags: ["Webhook Management"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    url: { type: "string", format: "uri" },
                    events: {
                      type: "array",
                      items: { type: "string" },
                      example: ["batch.completed", "batch.failed"],
                    },
                    secret: {
                      type: "string",
                      description: "Optional webhook secret",
                    },
                  },
                  required: ["url", "events"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Webhook created successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      webhookId: { type: "string" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/webhooks/events": {
        get: {
          summary: "Get Webhook Events",
          description: "Get webhook events with optional filtering",
          tags: ["Webhook Management"],
          parameters: [
            {
              name: "status",
              in: "query",
              description: "Filter by event status",
              required: false,
              schema: {
                type: "string",
                enum: ["pending", "delivered", "failed"],
              },
            },
            {
              name: "webhookId",
              in: "query",
              description: "Filter by webhook ID",
              required: false,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Webhook events retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      events: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            webhookId: { type: "string" },
                            eventType: { type: "string" },
                            status: { type: "string" },
                            payload: { type: "object" },
                            createdAt: { type: "number" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/webhooks/deliveries": {
        get: {
          summary: "Get Webhook Deliveries",
          description: "Get webhook delivery attempts with optional filtering",
          tags: ["Webhook Management"],
          parameters: [
            {
              name: "webhookId",
              in: "query",
              description: "Filter by webhook ID",
              required: false,
              schema: { type: "string" },
            },
            {
              name: "status",
              in: "query",
              description: "Filter by delivery status",
              required: false,
              schema: {
                type: "string",
                enum: ["pending", "success", "failed"],
              },
            },
          ],
          responses: {
            "200": {
              description: "Webhook deliveries retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      deliveries: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            webhookId: { type: "string" },
                            eventId: { type: "string" },
                            status: { type: "string" },
                            responseCode: { type: "number", nullable: true },
                            responseBody: { type: "string", nullable: true },
                            attemptCount: { type: "number" },
                            createdAt: { type: "number" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/health": {
        get: {
          summary: "Health Check",
          description:
            "Get comprehensive health status including metrics, circuit breakers, and cache warming status",
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
                      metrics: { type: "object" },
                      circuitBreakers: { type: "object" },
                      cacheWarming: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/metrics": {
        get: {
          summary: "Get Performance Metrics",
          description: "Get detailed performance metrics and statistics",
          tags: ["System"],
          responses: {
            "200": {
              description: "Metrics retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      requests: {
                        type: "object",
                        properties: {
                          total: { type: "number" },
                          errors: { type: "number" },
                          errorRate: { type: "number" },
                        },
                      },
                      geocoding: { type: "object" },
                      r2: { type: "object" },
                      lookup: { type: "object" },
                      batch: { type: "object" },
                      webhooks: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/cache-warming": {
        get: {
          summary: "Get Cache Warming Status",
          description: "Get current cache warming status and configuration",
          tags: ["Cache Management"],
          responses: {
            "200": {
              description: "Cache warming status retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      isRunning: { type: "boolean" },
                      lastWarmed: { type: "number" },
                      currentBatch: { type: "number" },
                      totalBatches: { type: "number" },
                      successCount: { type: "number" },
                      failureCount: { type: "number" },
                      nextWarmingTime: { type: "number" },
                      config: {
                        type: "object",
                        properties: {
                          enabled: { type: "boolean" },
                          interval: { type: "number" },
                          batchSize: { type: "number" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/webhooks": {
        get: {
          summary: "List Webhooks (Legacy)",
          description:
            "Legacy endpoint for listing webhooks - use /api/webhooks instead",
          tags: ["Webhook Management"],
          responses: {
            "200": {
              description: "Webhooks list retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      webhooks: {
                        type: "array",
                        items: { type: "object" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/webhooks/events": {
        get: {
          summary: "Get Webhook Events (Legacy)",
          description:
            "Legacy endpoint for webhook events - use /api/webhooks/events instead",
          tags: ["Webhook Management"],
          responses: {
            "200": {
              description: "Webhook events retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      events: { type: "array" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/webhooks/deliveries": {
        get: {
          summary: "Get Webhook Deliveries (Legacy)",
          description:
            "Legacy endpoint for webhook deliveries - use /api/webhooks/deliveries instead",
          tags: ["Webhook Management"],
          responses: {
            "200": {
              description: "Webhook deliveries retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      deliveries: { type: "array" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
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
        name: "Quebec Ridings",
        description: "Operations for Quebec provincial riding lookups",
      },
      {
        name: "Ontario Ridings",
        description: "Operations for Ontario provincial riding lookups",
      },
      {
        name: "Batch Processing",
        description: "Batch processing operations",
      },
      {
        name: "Queue Operations",
        description: "Queue-based batch processing operations",
      },
      {
        name: "Database Operations",
        description: "Spatial database management and operations",
      },
      {
        name: "Boundaries",
        description: "Boundary data access and configuration",
      },
      {
        name: "Geocoding",
        description: "Geocoding service management and status",
      },
      {
        name: "Cache Management",
        description: "Cache warming and management operations",
      },
      {
        name: "Webhook Management",
        description: "Webhook configuration and monitoring",
      },
      {
        name: "System",
        description: "System health and monitoring endpoints",
      },
    ],
  };
}
