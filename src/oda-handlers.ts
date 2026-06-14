import { Env, QueryParams } from './types';
import { initializeOdaDatabase, getOdaStats } from './oda-schema';
import { isOdaEnabled } from './oda-config';
import {
  geocodeWithOda,
  reverseGeocodeWithOda,
  normalizeAddressWithOda,
  OdaGeocodeError,
} from './oda-geocoding';
import { parseQuery, badRequest, getCorrelationId } from './utils';
import { normalizeAddressWithGoogle } from './geocoding';
import { GoogleAddressComponents, CanadaPostStyleAddress } from './types';

function odaErrorResponse(error: unknown, correlationId: string): Response {
  if (error instanceof OdaGeocodeError) {
    return badRequest(error.message, error.status, error.code, correlationId);
  }
  const message = error instanceof Error ? error.message : 'ODA geocoding failed';
  return badRequest(message, 500, 'GEOCODING_ERROR', correlationId);
}

function geocodeJsonResponse(
  query: QueryParams,
  result: Awaited<ReturnType<typeof geocodeWithOda>>,
  correlationId: string
): Response {
  return new Response(
    JSON.stringify({
      query,
      point: { lon: result.lon, lat: result.lat },
      geocodeMethod: result.geocodeMethod,
      confidence: result.confidence,
      matchedFields: result.matchedFields,
      distanceMeters: result.distanceMeters,
      normalizedAddress: result.normalizedAddress,
      mailingAddress: result.mailingAddress,
      addressComponents: result.addressComponents,
      dataSource: result.dataSource,
      correlationId,
    }),
    { headers: { 'content-type': 'application/json; charset=UTF-8' } }
  );
}

export async function handleOdaInit(env: Env): Promise<Response> {
  const success = await initializeOdaDatabase(env);
  return new Response(
    JSON.stringify({
      success,
      message: success ? 'ODA database initialized successfully' : 'ODA database initialization failed',
    }),
    { headers: { 'content-type': 'application/json; charset=UTF-8' } }
  );
}

export async function handleOdaStats(env: Env): Promise<Response> {
  const stats = await getOdaStats(env);
  return new Response(JSON.stringify(stats), {
    headers: { 'content-type': 'application/json; charset=UTF-8' },
  });
}

export async function handleGeocodeRoute(request: Request, env: Env): Promise<Response> {
  const correlationId = getCorrelationId(request);
  if (!isOdaEnabled(env)) {
    return badRequest('ODA geocoding is not enabled', 503, 'ODA_NOT_ENABLED', correlationId);
  }

  const { validation } = parseQuery(request);
  if (!validation.valid || !validation.sanitized) {
    return badRequest(validation.error || 'Invalid query', 400, 'INVALID_QUERY', correlationId);
  }

  if (validation.sanitized.lat !== undefined && validation.sanitized.lon !== undefined) {
    return badRequest(
      'Use /api/reverse for coordinate lookups',
      400,
      'INVALID_QUERY',
      correlationId
    );
  }

  try {
    const result = await geocodeWithOda(env, validation.sanitized);
    return geocodeJsonResponse(validation.sanitized, result, correlationId);
  } catch (error) {
    return odaErrorResponse(error, correlationId);
  }
}

export async function handleReverseRoute(request: Request, env: Env): Promise<Response> {
  const correlationId = getCorrelationId(request);
  if (!isOdaEnabled(env)) {
    return badRequest('ODA geocoding is not enabled', 503, 'ODA_NOT_ENABLED', correlationId);
  }

  const { validation } = parseQuery(request);
  if (!validation.valid || !validation.sanitized) {
    return badRequest(validation.error || 'Invalid query', 400, 'INVALID_QUERY', correlationId);
  }

  if (validation.sanitized.lat === undefined || validation.sanitized.lon === undefined) {
    return badRequest('lat and lon are required', 400, 'INVALID_QUERY', correlationId);
  }

  try {
    const result = await reverseGeocodeWithOda(
      env,
      validation.sanitized.lat,
      validation.sanitized.lon
    );
    return geocodeJsonResponse(validation.sanitized, result, correlationId);
  } catch (error) {
    return odaErrorResponse(error, correlationId);
  }
}

export async function handleNormalizeAddressRoute(request: Request, env: Env): Promise<Response> {
  const correlationId = getCorrelationId(request);
  if (!isOdaEnabled(env)) {
    return badRequest('ODA geocoding is not enabled', 503, 'ODA_NOT_ENABLED', correlationId);
  }

  const { validation } = parseQuery(request);
  if (!validation.valid || !validation.sanitized) {
    return badRequest(validation.error || 'Invalid query', 400, 'INVALID_QUERY', correlationId);
  }

  try {
    const result = await normalizeAddressWithOda(env, validation.sanitized);
    return new Response(
      JSON.stringify({
        query: validation.sanitized,
        normalizedAddress: result.normalizedAddress,
        mailingAddress: result.mailingAddress,
        addressComponents: result.addressComponents,
        geocodeMethod: result.geocodeMethod,
        confidence: result.confidence,
        dataSource: result.dataSource,
        correlationId,
      }),
      { headers: { 'content-type': 'application/json; charset=UTF-8' } }
    );
  } catch (error) {
    return odaErrorResponse(error, correlationId);
  }
}

export async function resolveNormalizedAddress(
  env: Env,
  lat: number,
  lon: number,
  qp: QueryParams,
  request?: Request,
  circuitBreaker?: { execute: (key: string, fn: () => Promise<unknown>) => Promise<unknown> }
): Promise<{ normalizedAddress?: string; addressComponents?: GoogleAddressComponents; mailingAddress?: CanadaPostStyleAddress } | undefined> {
  if (isOdaEnabled(env)) {
    try {
      const result = await reverseGeocodeWithOda(env, lat, lon);
      return {
        normalizedAddress: result.normalizedAddress,
        addressComponents: result.addressComponents as GoogleAddressComponents,
        mailingAddress: result.mailingAddress,
      };
    } catch {
      if (qp.address || qp.postal || qp.city) {
        try {
          const result = await geocodeWithOda(env, qp);
          return {
            normalizedAddress: result.normalizedAddress,
            addressComponents: result.addressComponents as GoogleAddressComponents,
            mailingAddress: result.mailingAddress,
          };
        } catch {
          return undefined;
        }
      }
      return undefined;
    }
  }

  const googleResult = await normalizeAddressWithGoogle(env, lat, lon, request, circuitBreaker);
  if (!googleResult) return undefined;
  return {
    normalizedAddress: googleResult.formattedAddress,
    addressComponents: googleResult.components,
  };
}
