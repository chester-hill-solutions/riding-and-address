/**
 * A minimal ArcGIS REST client that reads a MapServer layer as GeoJSON.
 *
 * Why this exists: the official Canadian boundary sources — Statistics Canada's 2021
 * Census cartographic boundary files and Elections Canada's electoral geography — are
 * published as ArcGIS REST services. Querying them directly is the only route that works
 * headlessly. The bulk-download hosts sit behind a bot WAF that answers 403 "Security
 * Check" to non-browser clients (`www12.statcan.gc.ca`), which is why the higher census
 * tiers cannot be obtained by simply downloading the zips.
 *
 * Contract:
 *   - every request carries a browser `User-Agent`, because the StatCan host rejects
 *     requests without one (a bare `fetch` gets 403/500; a UA gets 200);
 *   - pages are read with `f=json` and `resultOffset`, honouring `exceededTransferLimit`
 *     rather than assuming a page is the last one;
 *   - 429 / 5xx / network failures are retried with bounded exponential backoff, because
 *     the StatCan host returns intermittent 500s even on valid layer requests;
 *   - the caller caps the work with `maxFeatures`, so a runaway source cannot exhaust
 *     memory or wall-clock time.
 */

import type { GeoJSONFeatureCollection, GeoJSONGeometry } from './types';

/** One feature as the ArcGIS JSON profile returns it. */
export interface ArcGisFeature {
  attributes: Record<string, unknown>;
  geometry: GeoJSONGeometry | null;
}

export interface ArcGisQueryPage {
  features: ArcGisFeature[];
  /** The service says there is more data than this page returned. */
  exceededTransferLimit: boolean;
}

/** A layer inside a MapServer service. */
export interface ArcGisLayerRef {
  /** MapServer root, e.g. `https://host/path/MapServer` (no trailing slash). */
  serviceUrl: string;
  /** Layer id inside the service. */
  layerId: number;
}

export interface ArcGisQueryOptions {
  /** SQL where clause. Defaults to `1=1` (everything). */
  where?: string;
  /** Comma-separated field list. Defaults to `*`. */
  outFields?: string;
  /** Output spatial reference. Defaults to 4326 (WGS84) so geometry arrives as lon/lat. */
  outSR?: number;
  /** Features per request. Defaults to 50; the service is unreliable above that with geometry. */
  pageSize?: number;
  /** Hard cap on total features. `undefined` means no cap. */
  maxFeatures?: number;
  /** Per-request timeout in milliseconds. Defaults to 60s. */
  timeoutMs?: number;
  /** Retries per request after the first attempt. Defaults to 4. */
  retries?: number;
  /** First backoff delay in milliseconds; doubles each attempt. Defaults to 500. */
  retryBaseDelayMs?: number;
  /** Browser user agent. The StatCan host rejects requests without one. */
  userAgent?: string;
  /** Injectable fetch, for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Called after each page with the running total. */
  onProgress?: (fetched: number) => void;
  /**
   * Pause between pages, in milliseconds.
   *
   * The service rate-limits aggressively: hammering it with back-to-back page requests
   * earns a 500 or a 403, and it keeps refusing for a while afterwards. One second
   * between pages is enough to stay under the limit while still finishing a national
   * layer in a reasonable time.
   */
  delayBetweenPagesMs?: number;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_RETRIES = 5;
const DEFAULT_RETRY_BASE_DELAY_MS = 2_000;

/** Errors the service returns as a 200 body rather than an HTTP status. */
export class ArcGisServiceError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ArcGisServiceError';
    this.status = status;
    this.details = details;
  }
}

/** Builds the query URL for one page. Exported so the shape is testable without a network. */
export function arcgisQueryUrl(
  ref: ArcGisLayerRef,
  offset: number,
  options: ArcGisQueryOptions = {}
): string {
  const where = options.where ?? '1=1';
  const outFields = options.outFields ?? '*';
  const outSR = options.outSR ?? 4326;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const base = ref.serviceUrl.replace(/\/+$/, '');

  const params = new URLSearchParams({
    where,
    outFields,
    returnGeometry: 'true',
    outSR: String(outSR),
    resultRecordCount: String(pageSize),
    resultOffset: String(offset),
    f: 'json',
  });

  // `geometryPrecision` is deliberately absent: the service answers 500 for every
  // combination that includes it with `outSR`, and `outSR=4326` is required so the
  // geometry arrives as lon/lat. The rounding that reduces the payload is applied
  // downstream, after the response arrives.
  return `${base}/${ref.layerId}/query?${params.toString()}`;
}

function isRetryableStatus(status: number): boolean {
  // 403 is included deliberately: the bot protection answers 403 (and sometimes a
  // disguised 500) when it decides the client is going too fast, and it recovers.
  return status === 403 || status === 408 || status === 425 || status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reads one page. Throws `ArcGisServiceError` for an HTTP failure or a 200 body that
 * carries an ArcGIS `error` object.
 */
export async function fetchArcGisPage(
  ref: ArcGisLayerRef,
  offset: number,
  options: ArcGisQueryOptions = {}
): Promise<ArcGisQueryPage> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = arcgisQueryUrl(ref, offset, options);
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': options.userAgent ?? DEFAULT_USER_AGENT,
      Accept: 'application/json',
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new ArcGisServiceError(
      `ArcGIS request failed with ${response.status} for ${ref.serviceUrl}/${ref.layerId}`,
      response.status,
      text.slice(0, 500)
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ArcGisServiceError(
      `ArcGIS response was not JSON for ${ref.serviceUrl}/${ref.layerId}`,
      response.status,
      text.slice(0, 500)
    );
  }

  const record = body as {
    features?: ArcGisFeature[];
    exceededTransferLimit?: boolean;
    error?: { code?: number; message?: string; details?: unknown };
  };

  if (record.error) {
    throw new ArcGisServiceError(
      record.error.message ?? 'ArcGIS service returned an error',
      record.error.code ?? response.status,
      record.error.details
    );
  }

  return {
    features: Array.isArray(record.features) ? record.features : [],
    exceededTransferLimit: record.exceededTransferLimit === true,
  };
}

/**
 * Reads every page of a layer, retrying transient failures.
 *
 * The loop stops on `exceededTransferLimit === false` (the service says this was the last
 * page), on a short page, or when `maxFeatures` is reached. It is safe to call against a
 * layer that returns everything in one response.
 */
export async function fetchArcGisLayer(
  ref: ArcGisLayerRef,
  options: ArcGisQueryOptions = {}
): Promise<ArcGisFeature[]> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxFeatures = options.maxFeatures;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const baseDelay = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const all: ArcGisFeature[] = [];
  let offset = 0;

  for (;;) {
    let attempt = 0;
    for (;;) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const page = await fetchArcGisPage(ref, offset, {
            ...options,
            fetchImpl: wrapWithAbort(options.fetchImpl ?? fetch, controller.signal),
          });
          all.push(...page.features);
          options.onProgress?.(all.length);

          const lastPage = !page.exceededTransferLimit && page.features.length < pageSize;
          if (lastPage) return all;
          if (maxFeatures !== undefined && all.length >= maxFeatures) {
            return all.slice(0, maxFeatures);
          }
          if (page.features.length === 0) return all;

          offset += page.features.length;
          const pause = options.delayBetweenPagesMs ?? 1_000;
          if (pause > 0) await delay(pause);
          break;
        } finally {
          clearTimeout(timer);
        }
      } catch (error) {
        const retryable =
          error instanceof ArcGisServiceError ? isRetryableStatus(error.status) : true;
        attempt += 1;
        if (!retryable || attempt > retries) {
          throw error;
        }
        const wait = baseDelay * 2 ** (attempt - 1);
        await delay(wait);
      }
    }
  }
}

/** Wraps a fetch implementation so an AbortSignal can be attached. */
function wrapWithAbort(fetchImpl: typeof fetch, signal: AbortSignal): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    fetchImpl(input, { ...init, signal })) as typeof fetch;
}

/**
 * Converts ArcGIS features into a GeoJSON FeatureCollection.
 *
 * Attributes become `properties`; a null geometry becomes an empty coordinates array so
 * the feature survives the round trip. The output is in the service's `outSR` (4326 by
 * default), so coordinates are already lon/lat.
 */
export function arcgisFeaturesToGeoJSON(features: ArcGisFeature[]): GeoJSONFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features.map((feature) => ({
      type: 'Feature',
      geometry: feature.geometry ?? { type: 'Polygon', coordinates: [] },
      properties: feature.attributes ?? {},
    })),
  };
}
