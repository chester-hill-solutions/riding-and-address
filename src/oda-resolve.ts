import { Env, QueryParams, GoogleAddressComponents, CanadaPostStyleAddress } from './types';
import { isOdaEnabled } from './oda-config';
import { geocodeWithOda, reverseGeocodeWithOda } from './oda-geocoding';
import { normalizeAddressWithGoogle } from './geocoding';

/**
 * Resolving a point or a query to a normalised address.
 *
 * **Moved out of `src/oda-handlers.ts` to break an import cycle.**
 *
 * This function is a *library* — a pure "given these inputs, what is the address" — and it did not
 * belong in a module of HTTP handlers. But `lookup-expansion.ts` imported it from there, and
 * `oda-handlers.ts` imported `consumeDailyQuota` from the Durable Object module, which imported
 * `upload-jobs.ts`, which imported `lookup-expansion.ts`. Four modules in a circle, and the
 * thing at the centre of it was a misplaced function.
 *
 * A handler module should not be a library another module imports a pure function from.
 */
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
