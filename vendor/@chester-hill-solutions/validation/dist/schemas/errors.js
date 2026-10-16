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
export function formatZodError(error) {
    const issues = error.issues;
    // Single issue - return the message directly
    if (issues.length === 1) {
        return issues[0].message;
    }
    // Multiple issues - format with field paths
    return issues
        .map((issue) => {
        const path = issue.path.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
    })
        .join("; ");
}
/**
 * Formats a Zod error into a field-level error object.
 * Useful for form validation where errors should be displayed per field.
 *
 * @param error - Zod error object
 * @returns Object with field names as keys and array of error messages as values
 */
export function formatFieldErrors(error) {
    const fieldErrors = error.flatten().fieldErrors;
    // Convert all values to string arrays for consistency
    const result = {};
    for (const [field, errors] of Object.entries(fieldErrors)) {
        result[field] = errors || [];
    }
    return result;
}
/**
 * Formats validation errors for API responses.
 * Maintains compatibility with existing error response format.
 *
 * @param error - Zod error object
 * @param context - Optional context for the error (e.g., operation, resource)
 * @returns Error object in the expected API format
 */
export function formatValidationError(error, context) {
    const message = formatZodError(error);
    // Maintain compatibility with existing formatApiError pattern
    if (context) {
        return {
            error: message,
            operation: context.operation,
            resource: context.resource,
            identifier: context.identifier,
        };
    }
    return { error: message };
}
/**
 * Creates a validation error response for React Router actions.
 * Compatible with existing error handling patterns.
 *
 * @param error - Zod error object
 * @param status - HTTP status code (default: 400)
 * @returns Response object with formatted error
 */
export function createValidationErrorResponse(error, status = 400) {
    return Response.json(formatValidationError(error), { status });
}
/**
 * Type guard to check if an error is a Zod error.
 *
 * @param error - Error to check
 * @returns True if the error is a ZodError
 */
export function isZodError(error) {
    return error instanceof z.ZodError;
}
