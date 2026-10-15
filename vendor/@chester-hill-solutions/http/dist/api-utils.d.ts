/**
 * API utilities with Zod validation integration.
 */
import type { z } from "zod";
/**
 * Parses and validates a JSON request body against a Zod schema.
 */
export declare function parseJsonBodyWithSchema<T>(schema: z.ZodSchema<T>, request: Request): Promise<{
    success: true;
    data: T;
} | {
    success: false;
    response: Response;
}>;
/**
 * Validates required fields on a plain object.
 */
export declare function validateRequiredFields<T extends Record<string, unknown>>(data: T, fields: (keyof T)[]): {
    valid: boolean;
    missing: string[];
};
