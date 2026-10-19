import { Env } from './types';
import {
  initializeSpatialDatabase,
  getSpatialDatabaseStats,
  syncGeoJSONToDatabase,
  queryRidingFromDatabase,
  getAllFeaturesFromDatabase,
  getSpatialDbConfig,
} from './spatial';
import { r2DatasetSource } from './dataset-source';
import { getAllR2Keys } from './datasets';
import { cachedLookupRiding, loadGeo } from './riding-lookup';
import { resolveLookupPath } from './return-selector';
import { jsonHeaders, type RouteContext } from './route-context';
import { badRequest, internalErrorResponse } from './utils';

/**
 * The spatial database and boundary surfaces.
 *
 * **Ported out of the Worker's legacy chain.** The behaviour did not change: the same paths, the
 * same methods, the same bodies, and the same 404 for a sub-path that is not one of them.
 *
 * ## Why these are one handler and not four
 *
 * The route table declares each sub-path separately — `/api/database/init`, `/api/database/sync`,
 * `/api/database/stats`, `/api/database/query` — because each has its own method and its own
 * auth: the first three are operator surfaces and the fourth is public. That declaration is what
 * the prelude enforces, and it is unchanged.
 *
 * What is unchanged too is how a request that does *not* match one of them is answered. A GET to
 * `/api/database/init` matches the table's `/api/database/*` entry, because the method is part of
 * the match — and the answer is the 404 this module returns. So the method checks stay here,
 * where they were, rather than moving into the table.
 */

/** `POST /api/database/init` — build the spatial index. Operator surface. */
async function databaseInit(ctx: RouteContext): Promise<Response> {
  const { env, correlationId } = ctx;
  try {
    const success = await initializeSpatialDatabase(env);
    return new Response(
      JSON.stringify({
        success,
        message: success ? 'Database initialized successfully' : 'Database initialization failed',
      }),
      { headers: jsonHeaders(ctx) }
    );
  } catch (error) {
    return internalErrorResponse(error, 'Database initialization failed', correlationId);
  }
}

/** `POST /api/database/sync` — load a dataset into the spatial index. Operator surface. */
async function databaseSync(ctx: RouteContext): Promise<Response> {
  const { request, env, correlationId } = ctx;
  try {
    const body = (await request.json()) as { dataset?: string };
    const dataset = body.dataset || 'federalridings-2024.geojson';

    const result = await syncGeoJSONToDatabase(env, dataset, r2DatasetSource(env));
    return new Response(
      JSON.stringify({
        success: result.success,
        inserted: result.inserted,
        failed: result.failed,
        message: result.success
          ? `Database synced for ${dataset}`
          : `Database sync incomplete for ${dataset}`,
        dataset,
      }),
      { headers: jsonHeaders(ctx) }
    );
  } catch (error) {
    return internalErrorResponse(error, 'Database sync failed', correlationId);
  }
}

/** `GET /api/database/stats` — the real D1 counts, or a disabled status. Operator surface. */
async function databaseStats(ctx: RouteContext): Promise<Response> {
  const { env, correlationId } = ctx;
  try {
    const stats = await getSpatialDatabaseStats(env);
    return new Response(
      JSON.stringify({
        enabled: stats !== null,
        status: stats !== null ? 'active' : 'disabled',
        // Real D1 counts only — no placeholder fields when the database is disabled.
        ...(stats !== null ? { features: stats.features, lastSync: stats.lastSync } : {}),
      }),
      { headers: jsonHeaders(ctx) }
    );
  } catch (error) {
    return internalErrorResponse(error, 'Failed to get database stats', correlationId);
  }
}

/** `GET /api/database/query` — the riding at a point, from the spatial index. Public. */
async function databaseQuery(ctx: RouteContext): Promise<Response> {
  const { env, correlationId } = ctx;
  const lat = parseFloat(ctx.url.searchParams.get('lat') || '');
  const lon = parseFloat(ctx.url.searchParams.get('lon') || '');
  const dataset = ctx.url.searchParams.get('dataset') || 'federalridings-2024.geojson';

  if (isNaN(lat) || isNaN(lon)) {
    return badRequest('Invalid lat/lon parameters', 400);
  }

  try {
    const result = await queryRidingFromDatabase(env, dataset, lon, lat);
    return new Response(JSON.stringify(result), { headers: jsonHeaders(ctx) });
  } catch (error) {
    return internalErrorResponse(error, 'Database query failed', correlationId);
  }
}

/**
 * The `/api/database/*` surface.
 *
 * The table's entry for each sub-path carries the method and the auth; this handler carries the
 * behaviour. A path that is not one of the four is a 404 — and so is a sub-path reached with the
 * wrong method, because the table's method matching sends it here rather than to the entry.
 */
export async function handleDatabaseRoute(ctx: RouteContext): Promise<Response> {
  const { request } = ctx;
  const pathname = ctx.url.pathname;

  if (pathname === '/api/database/init' && request.method === 'POST') {
    return databaseInit(ctx);
  }
  if (pathname === '/api/database/sync' && request.method === 'POST') {
    return databaseSync(ctx);
  }
  if (pathname === '/api/database/stats' && request.method === 'GET') {
    return databaseStats(ctx);
  }
  if (pathname === '/api/database/query' && request.method === 'GET') {
    return databaseQuery(ctx);
  }

  return badRequest('Database endpoint not found', 404);
}

/** `GET /api/boundaries/lookup` — the riding at a point. Public. */
async function boundariesLookup(ctx: RouteContext): Promise<Response> {
  const { env, correlationId } = ctx;
  const lat = parseFloat(ctx.url.searchParams.get('lat') || '');
  const lon = parseFloat(ctx.url.searchParams.get('lon') || '');

  if (isNaN(lat) || isNaN(lon)) {
    return badRequest('Invalid lat/lon parameters', 400);
  }

  try {
    const result = await cachedLookupRiding(env, resolveLookupPath('/api').datasetPath, lon, lat);
    return new Response(JSON.stringify(result), { headers: jsonHeaders(ctx) });
  } catch (error) {
    return internalErrorResponse(error, 'Boundaries lookup failed', correlationId);
  }
}

/** `GET /api/boundaries/all` — paged features from the spatial index. Public. */
async function boundariesAll(ctx: RouteContext): Promise<Response> {
  const { env, correlationId } = ctx;
  const dataset = ctx.url.searchParams.get('dataset') || 'federalridings-2024.geojson';
  const limit = parseInt(ctx.url.searchParams.get('limit') || '100', 10);
  const offset = parseInt(ctx.url.searchParams.get('offset') || '0', 10);

  try {
    const dbConfig = getSpatialDbConfig(env);
    if (dbConfig.ENABLED && env.RIDING_DB) {
      const result = await getAllFeaturesFromDatabase(env, dataset, limit, offset);
      return new Response(JSON.stringify(result), { headers: jsonHeaders(ctx) });
    }
    return badRequest('Spatial database not enabled', 503);
  } catch (error) {
    return internalErrorResponse(error, 'Failed to get boundaries', correlationId);
  }
}

/** `GET /api/boundaries/config` — what this deployment can serve. Public. */
function boundariesConfig(ctx: RouteContext): Response {
  const dbConfig = getSpatialDbConfig(ctx.env);
  return new Response(
    JSON.stringify({
      enabled: dbConfig.ENABLED,
      useRtreeIndex: dbConfig.USE_RTREE_INDEX,
      batchInsertSize: dbConfig.BATCH_INSERT_SIZE,
      datasets: getAllR2Keys(),
    }),
    { headers: jsonHeaders(ctx) }
  );
}

/** The `/api/boundaries/*` surface. */
export async function handleBoundariesRoute(ctx: RouteContext): Promise<Response> {
  const { request } = ctx;
  const pathname = ctx.url.pathname;

  if (pathname === '/api/boundaries/lookup' && request.method === 'GET') {
    return boundariesLookup(ctx);
  }
  if (pathname === '/api/boundaries/all' && request.method === 'GET') {
    return boundariesAll(ctx);
  }
  if (pathname === '/api/boundaries/config' && request.method === 'GET') {
    return boundariesConfig(ctx);
  }

  return badRequest('Boundaries endpoint not found', 404);
}

/**
 * `GET /api/geocoding/batch/status` — the batch geocoding surface's own status.
 *
 * A static answer: the endpoint has always been a description of the surface rather than a
 * report about work in flight, and it is public, so it says what the surface supports.
 */
export function handleGeocodingBatchStatus(ctx: RouteContext): Response {
  return new Response(
    JSON.stringify({
      enabled: true,
      maxBatchSize: 10,
      timeout: 30000,
      retryAttempts: 3,
      fallbackToIndividual: true,
      hasGoogleApiKey: !!(ctx.env.GOOGLE_MAPS_KEY),
      timestamp: Date.now(),
    }),
    { headers: jsonHeaders(ctx) }
  );
}

/** `POST /api/cache/warm` — warm the lookup cache for a set of points. Operator surface. */
export async function handleCacheWarm(ctx: RouteContext): Promise<Response> {
  const { request, env, correlationId } = ctx;
  try {
    const body = (await request.json()) as {
      locations?: Array<{ lat: number; lon: number; postal?: string }>;
    };
    const locations = body.locations || [];

    for (const location of locations) {
      if (location.lat && location.lon) {
        await loadGeo(env, 'federalridings-2024.geojson');
      }
      // Postal-only entries have never warmed anything here; geocoding them first
      // would be required, and that work belongs to performCacheWarming.
    }

    return new Response(
      JSON.stringify({
        message: 'Cache warming initiated',
        locations: locations.length,
        timestamp: Date.now(),
      }),
      { headers: jsonHeaders(ctx) }
    );
  } catch (error) {
    return internalErrorResponse(error, 'Cache warming failed', correlationId);
  }
}

/** The `Env` shape the boundary handlers read; re-exported for the tests that build one. */
export type SpatialHandlerEnv = Env;
