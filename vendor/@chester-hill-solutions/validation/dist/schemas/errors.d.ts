/**
 * Error formatting utilities for Zod validation errors.
 * Provides consistent error message formatting across the application.
 */
import { z } from "zod";
/**
 * Formats a Zod error into a single user-friendly string.
 *
 * @param error - Zod error object
 * @returns Formatted error message string
 */
export declare function formatZodError(error: z.ZodError): string;
/**
 * Formats a Zod error into a field-level error object.
 * Useful for form validation where errors should be displayed per field.
 *
 * @param error - Zod error object
 * @returns Object with field names as keys and array of error messages as values
 */
export declare function formatFieldErrors(error: z.ZodError): Record<string, string[]>;
/**
 * Formats validation errors for API responses.
 * Maintains compatibility with existing error response format.
 *
 * @param error - Zod error object
 * @param context - Optional context for the error (e.g., operation, resource)
 * @returns Error object in the expected API format
 */
export declare function formatValidationError(error: z.ZodError, context?: {
    operation?: string;
    resource?: string;
    identifier?: string;
}): {
    error: string;
    operation: string | undefined;
    resource: string | undefined;
    identifier: string | undefined;
} | {
    error: string;
    operation?: undefined;
    resource?: undefined;
    identifier?: undefined;
};
/**
 * Creates a validation error response for React Router actions.
 * Compatible with existing error handling patterns.
 *
 * @param error - Zod error object
 * @param status - HTTP status code (default: 400)
 * @returns Response object with formatted error
 */
export declare function createValidationErrorResponse(error: z.ZodError, status?: number): Response;
/**
 * Type guard to check if an error is a Zod error.
 *
 * @param error - Error to check
 * @returns True if the error is a ZodError
 */
export declare function isZodError(error: unknown): error is z.ZodError;
