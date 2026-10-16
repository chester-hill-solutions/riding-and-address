/**
 * API utilities with Zod validation integration.
 */
import { formatZodError } from "@chester-hill-solutions/validation";
import { jsonError } from "./http.js";
/**
 * Parses and validates a JSON request body against a Zod schema.
 */
export async function parseJsonBodyWithSchema(schema, request) {
    try {
        const jsonBody = await request.json();
        const result = await schema.safeParseAsync(jsonBody);
        if (!result.success) {
            return {
                success: false,
                response: jsonError({
                    error: formatZodError(result.error),
                }, 400),
            };
        }
        return { success: true, data: result.data };
    }
    catch (_parseError) {
        return {
            success: false,
            response: jsonError({
                error: "Invalid JSON in request body",
            }, 400),
        };
    }
}
/**
 * Validates required fields on a plain object.
 */
export function validateRequiredFields(data, fields) {
    const missing = [];
    for (const field of fields) {
        if (data[field] === undefined || data[field] === null || data[field] === "") {
            missing.push(String(field));
        }
    }
    return { valid: missing.length === 0, missing };
}
