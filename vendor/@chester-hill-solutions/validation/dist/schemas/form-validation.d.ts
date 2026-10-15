/**
 * Form validation helpers for React Router integration.
 * Provides seamless integration between FormData and Zod schemas.
 */
import { type z } from "zod";
/**
 * Validates FormData against a Zod schema.
 * Converts FormData to object, validates, and returns typed result.
 */
export declare function validateFormData<T>(schema: z.ZodSchema<T>, formData: FormData): Promise<{
    success: true;
    data: T;
} | {
    success: false;
    error: string;
}>;
/**
 * Validates FormData and returns field-level errors.
 * Useful for forms that need to display errors per input field.
 */
export declare function validateFormDataWithFieldErrors<T>(schema: z.ZodSchema<T>, formData: FormData): Promise<{
    success: true;
    data: T;
} | {
    success: false;
    errors: Record<string, string[]>;
}>;
/**
 * Type guard to check if validation result is successful.
 *
 * @param result - Validation result
 * @returns True if validation succeeded
 */
export declare function isValidationSuccess<T>(result: {
    success: true;
    data: T;
} | {
    success: false;
    error: string;
}): result is {
    success: true;
    data: T;
};
/**
 * Type guard to check if field-level validation result is successful.
 *
 * @param result - Validation result with field errors
 * @returns True if validation succeeded
 */
export declare function isFieldValidationSuccess<T>(result: {
    success: true;
    data: T;
} | {
    success: false;
    errors: Record<string, string[]>;
}): result is {
    success: true;
    data: T;
};
