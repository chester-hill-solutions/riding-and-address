/**
 * Email address-list parsing and validation.
 *
 * Splits a single string of addresses (comma / semicolon / newline separated)
 * into individual recipients, optionally normalizing and validating each one.
 */
export type EmailListOptions = {
    /** Strings to split on. Default: comma, semicolon, newline. */
    separators?: readonly string[];
    /** Trim and lowercase each address. Default: true. */
    normalize?: boolean;
    /** Drop case-insensitive duplicates, keeping the first. Default: true. */
    dedupe?: boolean;
};
export type ParsedEmailList = {
    /** Valid addresses, normalized. */
    addresses: string[];
    /** Addresses that failed validation, in input order. */
    invalid: string[];
};
/**
 * Split a string into de-duplicated email addresses. No validation is applied.
 *
 * ```ts
 * splitEmailList("a@example.com, b@example.com")
 * // ["a@example.com", "b@example.com"]
 * ```
 */
export declare function splitEmailList(input: string | null | undefined, options?: EmailListOptions): string[];
/**
 * Split and validate an address list. Invalid entries are returned separately so
 * callers can surface a field-level error.
 *
 * ```ts
 * parseEmailList("a@example.com, nope")
 * // { addresses: ["a@example.com"], invalid: ["nope"] }
 * ```
 */
export declare function parseEmailList(input: string | null | undefined, options?: EmailListOptions): ParsedEmailList;
