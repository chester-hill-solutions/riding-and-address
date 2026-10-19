import { normalizeCanadianPostalCode } from '@chester-hill-solutions/validation';
import { QueryParams } from './types';
import { parseGeocodeMethodParam } from './geocode-query';
import { parseReturnSelector, parseIncludeProvince, resolveIncludeProvince } from './return-selector';

/**
 * Sanitising and validating what a caller sends.
 *
 * **Moved out of `src/utils.ts` so that `utils.ts` could stop being a dependency of everything.**
 *
 * `oda-normalize.ts` needed `validatePostalCode`, so it imported `utils.ts`, and `utils.ts`
 * re-exported the dataset registry — which closed a cycle through `datasets.ts`. The rule that
 * came out of it: a module that others need for one function should not be the module everything
 * else imports.
 */
// Validation interfaces
export interface ValidationResult {
  valid: boolean;
  sanitized?: QueryParams;
  error?: string;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

/**
 * Sanitizes a string input by removing control characters and limiting length.
 * 
 * @param input - The string to sanitize
 * @param maxLength - Maximum allowed length (default: 1000)
 * @returns Sanitized string or undefined if input is empty/invalid
 */
export function sanitizeString(input: string | undefined, maxLength: number = 1000): string | undefined {
  if (!input) return undefined;
  
  // Remove null bytes and control characters
  let sanitized = input.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized.length > 0 ? sanitized : undefined;
}

/**
 * Validates geographic coordinates.
 * 
 * @param lat - Latitude (-90 to 90, inclusive)
 * @param lon - Longitude (-180 to 180, inclusive)
 * @returns Validation result with sanitized coordinates or error message
 */
export function validateCoordinates(lat: number | undefined, lon: number | undefined): { valid: boolean; lat?: number; lon?: number; error?: string } {
  if (lat === undefined && lon === undefined) {
    return { valid: true };
  }
  
  if (lat === undefined || lon === undefined) {
    return { valid: false, error: "Both lat and lon must be provided together" };
  }
  
  // Check for valid coordinate ranges (boundaries are inclusive: -90 <= lat <= 90, -180 <= lon <= 180)
  if (lat < -90 || lat > 90) {
    return { valid: false, error: "Latitude must be between -90 and 90 (inclusive)" };
  }
  
  if (lon < -180 || lon > 180) {
    return { valid: false, error: "Longitude must be between -180 and 180 (inclusive)" };
  }
  
  // Check for NaN or Infinity
  if (!isFinite(lat) || !isFinite(lon)) {
    return { valid: false, error: "Coordinates must be finite numbers" };
  }
  
  return { valid: true, lat, lon };
}

/**
 * Validates and sanitizes postal codes.
 * Strictly validates Canadian postal codes (A1A 1A1 format), but allows
 * international postal codes to pass through for geocoding services.
 * 
 * @param postal - Postal code string to validate
 * @returns Validation result with sanitized postal code or error message
 */
export function validatePostalCode(postal: string): { valid: boolean; sanitized?: string; error?: string } {
  if (!postal) return { valid: true };
  
  const canadianPostal = normalizeCanadianPostalCode(postal);
  if (canadianPostal) return { valid: true, sanitized: canadianPostal };
  
  // Not a Canadian postal code, but allow it to pass through for geocoding
  // Just sanitize by removing extra spaces and converting to uppercase
  const cleaned = postal.trim().replace(/\s+/g, ' ').toUpperCase();
  if (cleaned.length > 0 && cleaned.length <= 20) {
    return { valid: true, sanitized: cleaned };
  }
  
  // Postal code is too long or empty after cleaning
  return { valid: false, error: "Postal code format is invalid or too long" };
}

/**
 * Validates and sanitizes query parameters for riding lookup requests.
 * Ensures coordinates are valid, postal codes are properly formatted,
 * and string inputs are sanitized.
 * 
 * @param query - Raw query parameters from request
 * @returns Validation result with sanitized parameters or error message
 */
export function validateAndSanitizeQuery(query: QueryParams, pathname: string): ValidationResult {
  const sanitized: QueryParams = {};
  
  // Sanitize string inputs
  sanitized.address = sanitizeString(query.address, 500);
  sanitized.city = sanitizeString(query.city, 100);
  sanitized.state = sanitizeString(query.state, 100);
  sanitized.country = sanitizeString(query.country, 100);
  
  // Validate postal code
  if (query.postal) {
    const postalValidation = validatePostalCode(query.postal);
    if (!postalValidation.valid) {
      return { valid: false, error: postalValidation.error };
    }
    sanitized.postal = postalValidation.sanitized;
  }
  
  // Validate coordinates
  const coordValidation = validateCoordinates(query.lat, query.lon);
  if (!coordValidation.valid) {
    return { valid: false, error: coordValidation.error };
  }
  if (coordValidation.lat !== undefined && coordValidation.lon !== undefined) {
    sanitized.lat = coordValidation.lat;
    sanitized.lon = coordValidation.lon;
  }

  if (query.return !== undefined) {
    const returnParse = parseReturnSelector(query.return);
    if (!returnParse.valid) {
      return { valid: false, error: returnParse.error };
    }
    sanitized.return = query.return;
    sanitized.returnFields = returnParse.fields;
  }

  if (query.include_province !== undefined) {
    const includeProvinceParse = parseIncludeProvince(query.include_province);
    if (!includeProvinceParse.valid) {
      return { valid: false, error: includeProvinceParse.error };
    }
    sanitized.include_province = query.include_province;
    sanitized.includeProvince = includeProvinceParse.value;
  }

  if (query.geocode_method !== undefined) {
    const geocodeMethodParse = parseGeocodeMethodParam(query.geocode_method);
    if (!geocodeMethodParse.valid) {
      return { valid: false, error: geocodeMethodParse.error };
    }
    sanitized.geocode_method = query.geocode_method;
    sanitized.geocodeMethod = geocodeMethodParse.value;
  } else {
    sanitized.geocodeMethod = 'auto';
  }

  sanitized.returnFields = sanitized.returnFields ?? [];
  sanitized.includeProvince = resolveIncludeProvince(
    pathname,
    sanitized.includeProvince,
    query.return !== undefined
  );
  
  // Check that at least one location parameter is provided
  const hasLocation = sanitized.address || sanitized.postal || sanitized.city || 
                     sanitized.state || sanitized.country || 
                     (sanitized.lat !== undefined && sanitized.lon !== undefined);
  
  if (!hasLocation) {
    return { valid: false, error: "At least one location parameter must be provided" };
  }
  
  return { valid: true, sanitized };
}

