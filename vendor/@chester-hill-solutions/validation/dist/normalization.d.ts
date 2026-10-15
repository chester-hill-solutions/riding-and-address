/**
 * Normalizes a person's name to Title Case.
 * Handles multiple words, preserving spacing.
 *
 * Examples:
 * - "john doe" -> "John Doe"
 * - "MARY JANE SMITH" -> "Mary Jane Smith"
 * - "o'brien" -> "O'brien"
 * - "  jean-pierre  " -> "Jean-pierre"
 *
 * @param value - Name to normalize
 * @returns Normalized name in Title Case
 *
 * @example
 * ```ts
 * normalizeName("john doe") // "John Doe"
 * normalizeName("  MARY JANE  ") // "Mary Jane"
 * ```
 */
export declare function normalizeName(value: string): string;
/**
 * Normalizes an email address.
 * Trims whitespace and converts to lowercase.
 *
 * @param value - Email to normalize
 * @returns Normalized email (trimmed, lowercase)
 *
 * @example
 * ```ts
 * normalizeEmail("  User@Example.COM  ") // "user@example.com"
 * ```
 */
export declare function normalizeEmail(value: string): string;
/**
 * Normalizes a Canadian postal code.
 *
 * - Removes all whitespace
 * - Converts to uppercase
 * - Optionally formats with space (e.g., "K1A 0B6")
 *
 * @param value - Postal code to normalize
 * @param formatWithSpace - If true, formats as "K1A 0B6" (default: false, returns "K1A0B6")
 * @returns Normalized postal code
 *
 * @example
 * ```ts
 * normalizePostalCode("k1a 0b6") // "K1A0B6"
 * normalizePostalCode("k1a 0b6", true) // "K1A 0B6"
 * normalizePostalCode("  M5V 3A8  ") // "M5V3A8"
 * ```
 */
export declare function normalizePostalCode(value: string, formatWithSpace?: boolean): string;
/**
 * Normalizes a phone number.
 *
 * Removes common formatting characters (spaces, dashes, parentheses, dots)
 * but preserves digits, plus signs, and extensions.
 *
 * Auto-prefixes '1' (North American country code) for 10-digit numbers
 * that don't already have a country code.
 *
 * Examples:
 * - "(555) 123-4567" -> "15551234567" (auto-prefixed)
 * - "1-800-555-1234" -> "18005551234"
 * - "+1 555 123 4567" -> "+15551234567"
 * - "555.123.4567 x123" -> "15551234567x123" (auto-prefixed)
 *
 * @param value - Phone number to normalize
 * @returns Normalized phone number (digits and + only, trimmed)
 *
 * @example
 * ```ts
 * normalizePhoneNumber("(555) 123-4567") // "15551234567"
 * normalizePhoneNumber("1-800-555-1234") // "18005551234"
 * ```
 */
export declare function normalizePhoneNumber(value: string): string;
/**
 * Normalizes a street address.
 *
 * - Trims whitespace
 * - Normalizes internal whitespace (multiple spaces to single space)
 * - Optionally capitalizes (Title Case)
 *
 * @param value - Street address to normalize
 * @param capitalize - If true, applies Title Case formatting (default: false)
 * @returns Normalized street address
 *
 * @example
 * ```ts
 * normalizeStreetAddress("  123 Main   St  ") // "123 Main St"
 * normalizeStreetAddress("123 main st", true) // "123 Main St"
 * ```
 */
export declare function normalizeStreetAddress(value: string, capitalize?: boolean): string;
/**
 * Normalizes a province/state name.
 *
 * - Trims whitespace
 * - Normalizes internal whitespace
 * - Optionally converts to Title Case
 *
 * @param value - Province/state to normalize
 * @param capitalize - If true, applies Title Case formatting (default: true)
 * @returns Normalized province/state name
 *
 * @example
 * ```ts
 * normalizeProvince("  ontario  ") // "Ontario"
 * normalizeProvince("NEW BRUNSWICK") // "New Brunswick"
 * ```
 */
export declare function normalizeProvince(value: string, capitalize?: boolean): string;
/**
 * Validates if a string looks like a valid Canadian postal code.
 *
 * Format: Letter-Number-Letter Number-Letter-Number (e.g., "K1A 0B6" or "K1A0B6")
 *
 * @param value - Postal code to validate
 * @returns True if the format appears valid
 *
 * @example
 * ```ts
 * isValidCanadianPostalCode("K1A 0B6") // true
 * isValidCanadianPostalCode("K1A0B6") // true
 * isValidCanadianPostalCode("12345") // false
 * ```
 */
export declare function isValidCanadianPostalCode(value: string): boolean;
/**
 * Normalizes whitespace in a string.
 * Trims leading/trailing whitespace and collapses internal whitespace to single spaces.
 *
 * @param value - String to normalize
 * @returns String with normalized whitespace
 *
 * @example
 * ```ts
 * normalizeWhitespace("  hello   world  ") // "hello world"
 * ```
 */
export declare function normalizeWhitespace(value: string): string;
/**
 * Unescape HTML entities and URL-encoded characters (server-safe version).
 * Also handles JavaScript/JSON escape sequences (e.g., \' → ').
 * Handles cases where data may be double-encoded (e.g., URL-encoded HTML entities).
 * This is a server-safe version that doesn't rely on browser APIs like DOMParser.
 *
 * @param text - The text to unescape
 * @returns The unescaped text
 *
 * @example
 * ```ts
 * unescapeString("John%20%26%20Jane") // "John & Jane"
 * unescapeString("&amp;lt;script&amp;gt;") // "<script>"
 * unescapeString("156 rue Notre-Dame-de-l\\'Ile") // "156 rue Notre-Dame-de-l'Ile"
 * ```
 */
export declare function unescapeString(text: string | null | undefined): string;
