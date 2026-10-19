/**
 * The machine-readable service terms, served at `/.well-known/cancoder.json`.
 *
 * W4 of `docs/ops/agent-first-product-plan.md`: an agent must be able to learn CanCoder's
 * capabilities, price, free tier, coverage, auth model, and error vocabulary as structured data,
 * without scraping marketing copy. Every value here is read from the same constant the Worker and
 * Portal enforce, so the published terms and the configured behaviour are one fact, not two:
 *
 *   - price / upload minimum  ← src/upload-sheet.ts
 *   - free allowance          ← src/customer.ts
 *   - rate limits             ← src/utils.ts
 *   - coverage                ← src/datasets.ts
 *   - auth errors             ← src/api-keys.ts
 *   - OAuth scopes            ← src/mcp-scopes.ts
 *
 * Payment is published **only when the rail is configured**: the `payment` block is built from the
 * same environment the Worker settles with, so this document cannot claim a payment capability the
 * deployment does not have — or stay silent about one it does. That second failure is how these terms
 * spent a morning telling agents the rail was off after it had been switched on.
 */

import { KEY_DENIAL_REASONS, httpStatusForKeyDenial, type KeyDenialReason } from './api-keys';
import { DEFAULT_FREE_MONTHLY_ALLOWANCE } from './customer';
import { FEDERAL_DATASET, getAllProvincialPaths, getAllProvincialDatasets } from './datasets';
import { AREA_MAX_RESULTS, AREA_UNIT_PRICE_USD, AREA_UNIT_RECORDS } from './offers';
import { UPLOAD_ROW_PRICE_USD } from './upload-sheet';
import { DEFAULT_DEMO_RATE_LIMIT, DEFAULT_RATE_LIMIT } from './utils';
import { MCP_SCOPES } from './mcp-scopes';

/** Where support requests go — the same target the OpenAPI `info.contact` advertises. */
export const SUPPORT_URL = 'https://github.com/chester-hill-solutions/riding-and-address/issues';

/** The upload Checkout card minimum, in USD (ADR 0006). */
const UPLOAD_MINIMUM_CHARGE_USD = 0.5;

export interface ServiceCapability {
  id: string;
  transport: 'http' | 'mcp';
  description: string;
  endpoints: string[];
}

/**
 * What the terms need to know about the payment rail, read from the same environment the Worker
 * settles with. Absent means the rail is not configured, and nothing is claimed.
 */
export interface PaymentTermsInput {
  protocol: string;
  version: number;
  scheme: string;
  network: string;
  asset: string;
  perPayerDailyCapUsd: number;
}

export interface ServiceTerms {
  service: string;
  description: string;
  url: string;
  docs: {
    guide: string;
    openapi: string;
    reference: string;
    /** How to authenticate — the credentials, the authorization server and the scopes. */
    auth: string;
  };
  capabilities: ServiceCapability[];
  pricing: {
    currency: string;
    unit: string;
    unitPrice: number;
    uploadRowPrice: number;
    uploadMinimumCharge: number;
    /**
     * The area product's own unit. Deliberately separate from `unitPrice`: a point lookup and a
     * 250-record area unit are different things, and inferring one from the other would misprice
     * the large query (W0 §7).
     */
    area: {
      unit: string;
      unitRecords: number;
      unitPrice: number;
      maxRecordsPerOffer: number;
      note: string;
    };
  };
  freeTier: {
    allowance: number;
    period: string;
    scope: string;
    sharedAcrossApiAndUploads: boolean;
  };
  rateLimits: {
    keyed: { requestsPerMinute: number };
    demo: { requestsPerMinute: number; per: string; billable: boolean };
  };
  coverage: {
    federal: { code: string; name: string; path: string; year: number; status: string };
    provincial: Array<{ code: string; name: string; path: string; year: number; status: string }>;
    addressSources: { oda: string; nar: string };
    jurisdictionsWithoutAddressData: string[];
  };
  auth: {
    serverKey: { prefix: string; transport: string; use: string };
    browserKey: { prefix: string; transport: string; use: string };
    demo: { credential: string; use: string };
    oauth: {
      issuer: string;
      metadata: string;
      protectedResource: string;
      grantType: string;
      pkce: string;
      scopes: string[];
      clientIdentification: string[];
      use: string;
    };
  };
  errors: {
    auth: Array<{ code: KeyDenialReason; httpStatus: number }>;
    request: Array<{ code: string; httpStatus: number }>;
    reference: string;
  };
  /**
   * Present only when the rail is configured. An agent reading this can decide whether it holds the
   * right asset *before* calling, rather than discovering it from a 402.
   */
  payment?: {
    accountFree: PaymentTermsInput & {
      /** How to obtain and pay an offer, in the order the protocol requires. */
      howToPay: string;
      /** No account, key or registration is needed: the payer's wallet authorises the spend. */
      requiresAccount: boolean;
    };
  };
  support: { url: string };
}

export function createServiceTerms(origin: string, payment?: PaymentTermsInput | null): ServiceTerms {
  return {
    service: 'CanCoder',
    description:
      'Canadian address autocomplete, geocoding, and electoral district lookup. Resolve a postal code, ' +
      'street address, or coordinate pair to a federal, provincial, or combined riding.',
    url: origin,
    docs: {
      guide: `${origin}/docs/agents.md`,
      openapi: `${origin}/api/docs`,
      reference: `${origin}/docs`,
      // The authentication document. The `auth` block below says what the credentials are; this
      // is where a client goes to find out how to get one that needs no key.
      auth: `${origin}/auth.md`,
    },
    capabilities: [
      {
        id: 'lookup',
        transport: 'http',
        description: 'Resolve an address, postal code, or coordinate pair to an electoral riding.',
        endpoints: ['/api', '/api/federal', '/api/combined', ...getAllProvincialPaths()].map(
          (path) => `${origin}${path}`
        ),
      },
      {
        id: 'quote',
        transport: 'http',
        description:
          'Request a free, expiring offer for a point lookup or an area search, bound to the request inputs, dataset vintage and a maximum price. Quoting consumes no billable usage.',
        endpoints: [`${origin}/api/quote`],
      },
      {
        id: 'area',
        transport: 'http',
        description:
          'Search civic address records inside an electoral riding, or inside a caller-supplied WGS84 Polygon or MultiPolygon. Priced in 250-record units; retrieved page by page from a signed cursor, so one accepted offer covers every page. Polygon queries are province-scoped in v1.',
        endpoints: [`${origin}/api/quote?operation=area.search`, `${origin}/api/area`],
      },
      {
        id: 'mcp',
        transport: 'mcp',
        description:
          'MCP server exposing the riding lookup, the quote tools for a paid lookup or area search, and a purchase tool that hands payment setup to a person.',
        endpoints: [`${origin}/mcp`],
      },
      {
        id: 'search',
        transport: 'http',
        description: 'Address autocomplete for streets within a city. Suggestions carry no riding.',
        endpoints: [`${origin}/api/search`],
      },
      {
        id: 'geocode',
        transport: 'http',
        description: 'Forward geocoding, reverse geocoding, and address normalization.',
        endpoints: [`${origin}/api/geocode`, `${origin}/api/reverse`, `${origin}/api/normalize-address`],
      },
    ],
    pricing: {
      currency: 'USD',
      unit: 'one successful lookup or search response',
      unitPrice: UPLOAD_ROW_PRICE_USD,
      uploadRowPrice: UPLOAD_ROW_PRICE_USD,
      uploadMinimumCharge: UPLOAD_MINIMUM_CHARGE_USD,
      area: {
        unit: `one area unit of ${AREA_UNIT_RECORDS} address records`,
        unitRecords: AREA_UNIT_RECORDS,
        unitPrice: AREA_UNIT_PRICE_USD,
        maxRecordsPerOffer: AREA_MAX_RESULTS,
        note:
          `Priced in whole ${AREA_UNIT_RECORDS}-record units, up to ${AREA_MAX_RESULTS} records per ` +
          'offer. The accepted ceiling is charged, not the number of pages read.',
      },
    },
    freeTier: {
      allowance: DEFAULT_FREE_MONTHLY_ALLOWANCE,
      period: 'UTC calendar month',
      scope: 'per Customer',
      sharedAcrossApiAndUploads: true,
    },
    rateLimits: {
      keyed: { requestsPerMinute: DEFAULT_RATE_LIMIT },
      demo: { requestsPerMinute: DEFAULT_DEMO_RATE_LIMIT, per: 'IP', billable: false },
    },
    coverage: {
      federal: {
        code: FEDERAL_DATASET.code,
        name: FEDERAL_DATASET.name,
        path: FEDERAL_DATASET.path,
        year: FEDERAL_DATASET.year,
        status: FEDERAL_DATASET.status,
      },
      provincial: getAllProvincialDatasets().map((dataset) => ({
        code: dataset.code,
        name: dataset.name,
        path: dataset.path,
        year: dataset.year,
        status: dataset.status,
      })),
      addressSources: {
        oda: 'Statistics Canada Open Database of Addresses, 2021 collection',
        nar: 'Statistics Canada National Address Register, 2026-06-26 release',
      },
      // Riding boundaries exist everywhere; these three have no imported address rows yet.
      jurisdictionsWithoutAddressData: ['NL', 'NU', 'YT'],
    },
    auth: {
      serverKey: {
        prefix: 'sk_',
        transport: 'Authorization: Bearer <server-key>',
        use: 'Backend lookup and geocode calls, metered per Customer.',
      },
      browserKey: {
        prefix: 'pk_',
        transport: '?key=<browser-key> or X-Api-Key',
        use: 'Search and embed from a browser, restricted to an origin allowlist.',
      },
      demo: { credential: 'none', use: 'Keyless trial on /api/demo/* and /mcp; not billable.' },
      // The authorization server, as a client needs it to get a scoped token. Every field here is
      // one a client acts on: where to read the metadata, which grant and which PKCE method, which
      // scopes to ask for, and how to identify the client. A document that lists only the key
      // methods leaves a client that wants a token — rather than a Customer-wide key — with
      // nothing to act on.
      oauth: {
        issuer: `${origin}/api/auth`,
        metadata: `${origin}/api/auth/.well-known/oauth-authorization-server`,
        protectedResource: `${origin}/.well-known/oauth-protected-resource/mcp`,
        grantType: 'authorization_code',
        pkce: 'S256',
        scopes: [...MCP_SCOPES],
        clientIdentification: ['client-id-metadata-document', 'pre-registration'],
        use:
          'A scoped access token for MCP calls, with a person approving the grant once at ' +
          `${origin}/consent. The token is bound to the MCP server as its audience (RFC 8707).`,
      },
    },
    errors: {
      auth: KEY_DENIAL_REASONS.map((reason) => ({
        code: reason,
        httpStatus: httpStatusForKeyDenial(reason),
      })),
      request: [
        { code: 'INVALID_QUERY', httpStatus: 400 },
        { code: 'NOT_FOUND', httpStatus: 404 },
        { code: 'MISDIRECTED_REQUEST', httpStatus: 421 },
        { code: 'RATE_LIMIT_EXCEEDED', httpStatus: 429 },
        { code: 'UNAUTHORIZED', httpStatus: 401 },
        { code: 'INTERNAL_ERROR', httpStatus: 500 },
      ],
      reference: `${origin}/api/docs`,
    },
    ...(payment
      ? {
          payment: {
            accountFree: {
              ...payment,
              howToPay:
                `Request a free, expiring offer from ${origin}/api/quote, then POST it to ` +
                `${origin}/api/quote/accept with a signed payment payload in the PAYMENT-SIGNATURE ` +
                'header. The exact amount, network and asset are in the PAYMENT-REQUIRED challenge, ' +
                'and one settled payment delivers the quoted result.',
              requiresAccount: false,
            },
          },
        }
      : {}),
    support: { url: SUPPORT_URL },
  };
}
