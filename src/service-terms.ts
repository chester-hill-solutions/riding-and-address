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
 *
 * Payment options are deliberately absent: no account-free rail ships until W6, and the plan's
 * discovery decision is to publish only capabilities CanCoder implements.
 */

import { KEY_DENIAL_REASONS, httpStatusForKeyDenial, type KeyDenialReason } from './api-keys';
import { DEFAULT_FREE_MONTHLY_ALLOWANCE } from './customer';
import { FEDERAL_DATASET, getAllProvincialPaths, getAllProvincialDatasets } from './datasets';
import { UPLOAD_ROW_PRICE_USD } from './upload-sheet';
import { DEFAULT_DEMO_RATE_LIMIT, DEFAULT_RATE_LIMIT } from './utils';

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

export interface ServiceTerms {
  service: string;
  description: string;
  url: string;
  docs: { guide: string; openapi: string; reference: string };
  capabilities: ServiceCapability[];
  pricing: {
    currency: string;
    unit: string;
    unitPrice: number;
    uploadRowPrice: number;
    uploadMinimumCharge: number;
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
  };
  errors: {
    auth: Array<{ code: KeyDenialReason; httpStatus: number }>;
    request: Array<{ code: string; httpStatus: number }>;
    reference: string;
  };
  support: { url: string };
}

export function createServiceTerms(origin: string): ServiceTerms {
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
          'Request a free, expiring offer for a lookup, bound to the request inputs, dataset vintage and a maximum price. Quoting consumes no billable usage.',
        endpoints: [`${origin}/api/quote`],
      },
      {
        id: 'mcp',
        transport: 'mcp',
        description: 'MCP server exposing the read-only lookup_riding tool.',
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
    support: { url: SUPPORT_URL },
  };
}
