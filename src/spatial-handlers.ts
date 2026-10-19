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
 * ## One handler per path, and why
 *
 * The route table already declares which path each entry serves and which methods it answers.
 * A single handler that switched on the pathname would be **a second source of truth for
 * something the table already says** — and the two can drift: change the table's path and the
 * handler keeps accepting the old one.
 *
 * So each entry gets a handler that knows only its own job, and the table is the only place that
 * says which path it is. The method is the handler's business because it is the thing the 405 is
 * about: the entry claims the path for every method, and the handler refuses the ones it does not
 * implement.
 */

/** `POST /api/database/init` — build the spatial index. Operator surface. */
export async function handleDatabaseInit(ctx: RouteContext): Promise<Response> {
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
export async function handleDatabaseSync(ctx: RouteContext): Promise<Response> {
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
export async function handleDatabaseStats(ctx: RouteContext): Promise<Response> {
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
export async function handleDatabaseQuery(ctx: RouteContext): Promise<Response> {
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
 * A database sub-path that is not one of the four.
 *
 * The table's catch-all entry. Its own wording, because it is the answer for this surface and
 * not for every surface: a caller that guesses at a path learns that the *surface* has no such
 * path, and nothing about what is behind it.
 */
export function handleDatabaseNotFound(_ctx: RouteContext): Response {
  return badRequest('Database endpoint not found', 404);
}

/** `GET /api/boundaries/lookup` — the riding at a point. Public. */
export async function handleBoundariesLookup(ctx: RouteContext): Promise<Response> {
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
export async function handleBoundariesAll(ctx: RouteContext): Promise<Response> {
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
export function handleBoundariesConfig(ctx: RouteContext): Response {
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

/** A boundaries sub-path that is not one of the three. The table's catch-all entry. */
export function handleBoundariesNotFound(_ctx: RouteContext): Response {
  return badRequest('Boundaries endpoint not found', 404);
}

/**
 * `GET /api/geocoding/batch/status` — the batch geocoding surface's own status.
 *
 * A static answer: the endpoint has always been a description of the surface rather than a
 * report about work in flight, and it is public, so it says what the surface supports.
 */
export function handleGeocodingBatchStatus(ctx: RouteContext): Response {
  if (ctx.request.method !== 'GET') {
    return badRequest('Method not allowed', 405);
  }
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
  if (request.method !== 'POST') {
    return badRequest('Method not allowed', 405);
  }
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
