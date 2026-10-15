/**
 * Form validation helpers for React Router integration.
 * Provides seamless integration between FormData and Zod schemas.
 */
import { formatZodError, formatFieldErrors } from "./errors.js";
/**
 * Converts FormData to a plain object.
 * Handles multiple values for same key (checkboxes, multi-selects).
 * Only includes fields that are actually present in FormData.
 */
function formDataToObject(formData) {
    const obj = {};
    for (const [key, value] of formData.entries()) {
        // Handle multiple values for same key (checkboxes, multi-selects)
        if (key in obj) {
            const existing = obj[key];
            if (Array.isArray(existing)) {
                existing.push(value);
            }
            else {
                obj[key] = [existing, value];
            }
        }
        else {
            obj[key] = value;
        }
    }
    return obj;
}
/**
 * Validates FormData against a Zod schema.
 * Converts FormData to object, validates, and returns typed result.
 */
export async function validateFormData(schema, formData) {
    try {
        const data = formDataToObject(formData);
        const result = await schema.safeParseAsync(data);
        if (!result.success) {
            return { success: false, error: formatZodError(result.error) };
        }
        return { success: true, data: result.data };
    }
    catch (_error) {
        // Handle any unexpected errors during form processing
        return {
            success: false,
            error: "Unknown validation error",
        };
    }
}
/**
 * Validates FormData and returns field-level errors.
 * Useful for forms that need to display errors per input field.
 */
export async function validateFormDataWithFieldErrors(schema, formData) {
    try {
        const data = formDataToObject(formData);
        const result = await schema.safeParseAsync(data);
        if (!result.success) {
            return { success: false, errors: formatFieldErrors(result.error) };
        }
        return { success: true, data: result.data };
    }
    catch (_error) {
        // Handle any unexpected errors during form processing
        return {
            success: false,
            errors: { _form: ["Unknown validation error"] },
        };
    }
}
/**
 * Type guard to check if validation result is successful.
 *
 * @param result - Validation result
 * @returns True if validation succeeded
 */
export function isValidationSuccess(result) {
    return result.success;
}
/**
 * Type guard to check if field-level validation result is successful.
 *
 * @param result - Validation result with field errors
 * @returns True if validation succeeded
 */
export function isFieldValidationSuccess(result) {
    return result.success;
}
