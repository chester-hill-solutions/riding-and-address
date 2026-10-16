/**
 * Email address-list parsing and validation.
 *
 * Splits a single string of addresses (comma / semicolon / newline separated)
 * into individual recipients, optionally normalizing and validating each one.
 */
import { normalizeEmail } from "./normalization.js";
import { EmailSchema } from "./schemas/common.js";
const DEFAULT_SEPARATORS = [",", ";", "\n"];
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function splitPattern(separators) {
    return new RegExp(separators.map(escapeRegExp).join("|"));
}
/**
 * Split a string into de-duplicated email addresses. No validation is applied.
 *
 * ```ts
 * splitEmailList("a@example.com, b@example.com")
 * // ["a@example.com", "b@example.com"]
 * ```
 */
export function splitEmailList(input, options = {}) {
    const { separators = DEFAULT_SEPARATORS, normalize = true, dedupe = true } = options;
    const raw = input?.trim();
    if (!raw)
        return [];
    const seen = new Set();
    const addresses = [];
    for (const part of raw.split(splitPattern(separators))) {
        const trimmed = part.trim();
        if (!trimmed)
            continue;
        const address = normalize ? normalizeEmail(trimmed) : trimmed;
        const key = address.toLowerCase();
        if (dedupe) {
            if (seen.has(key))
                continue;
            seen.add(key);
        }
        addresses.push(address);
    }
    return addresses;
}
/**
 * Split and validate an address list. Invalid entries are returned separately so
 * callers can surface a field-level error.
 *
 * ```ts
 * parseEmailList("a@example.com, nope")
 * // { addresses: ["a@example.com"], invalid: ["nope"] }
 * ```
 */
export function parseEmailList(input, options = {}) {
    const candidates = splitEmailList(input, { ...options, normalize: false });
    const addresses = [];
    const invalid = [];
    const seen = new Set();
    for (const candidate of candidates) {
        const parsed = EmailSchema.safeParse(candidate);
        if (!parsed.success) {
            invalid.push(candidate);
            continue;
        }
        const key = parsed.data.toLowerCase();
        if (options.dedupe === false || !seen.has(key)) {
            seen.add(key);
            addresses.push(parsed.data);
        }
    }
    return { addresses, invalid };
}
