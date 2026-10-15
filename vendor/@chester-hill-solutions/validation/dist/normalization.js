/**
 * String normalization utilities for consistent data handling.
 *
 * These utilities standardize user input across the application,
 * ensuring consistent formatting for database storage and display.
 */
import { unescapeJsString } from "./unescape-js-string.js";
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
export function normalizeName(value) {
    return value
        .trim()
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
}
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
export function normalizeEmail(value) {
    return value.trim().toLowerCase();
}
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
export function normalizePostalCode(value, formatWithSpace = false) {
    const normalized = value.replace(/\s+/g, "").toUpperCase();
    if (formatWithSpace && normalized.length === 6) {
        // Format as "K1A 0B6" (3 chars, space, 3 chars)
        return `${normalized.slice(0, 3)} ${normalized.slice(3)}`;
    }
    return normalized;
}
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
export function normalizePhoneNumber(value) {
    const normalized = value
        .trim()
        // Remove spaces, dashes, parentheses, dots, but keep + for country codes
        .replace(/[\s\-().]/g, "")
        // Remove dots but preserve them before 'x' or 'ext' for extensions
        .replace(/\.(?!x|ext)/gi, "")
        // Normalize extension separators to lowercase 'x'
        .replace(/\s*(?:x|ext|extension)\s*/gi, "x")
        // Collapse multiple 'x' separators
        .replace(/x+/gi, "x");
    // Auto-prefix '1' for 10-digit numbers without a country code
    // Extract the main number (before any extension)
    const extensionMatch = normalized.match(/^([^x]*)(x.*)$/i);
    const mainNumber = extensionMatch ? extensionMatch[1] : normalized;
    const extension = extensionMatch ? extensionMatch[2] : "";
    // If the main number is exactly 10 digits and doesn't start with '+', prefix with '1'
    const digitsOnly = mainNumber.replace(/\D/g, "");
    if (digitsOnly.length === 10 && !mainNumber.startsWith("+")) {
        return "1" + digitsOnly + extension;
    }
    return normalized;
}
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
export function normalizeStreetAddress(value, capitalize = false) {
    let normalized = value.trim().replace(/\s+/g, " "); // Normalize whitespace
    if (capitalize) {
        normalized = normalizeName(normalized);
    }
    return normalized;
}
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
export function normalizeProvince(value, capitalize = true) {
    let normalized = value.trim().replace(/\s+/g, " "); // Normalize whitespace
    if (capitalize) {
        normalized = normalizeName(normalized);
    }
    return normalized;
}
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
export function isValidCanadianPostalCode(value) {
    const normalized = normalizePostalCode(value);
    // Canadian postal code: Letter-Number-Letter Number-Letter-Number
    return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(normalized);
}
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
export function normalizeWhitespace(value) {
    return value.trim().replace(/\s+/g, " ");
}
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
export function unescapeString(text) {
    if (!text)
        return "";
    try {
        // First decode URL encoding
        const decoded = decodeURIComponent(text);
        // Then unescape HTML entities (may need multiple passes for double-encoded data)
        let previous = "";
        let current = decoded;
        // Limit to 3 passes to prevent infinite loops
        for (let i = 0; i < 3 && current !== previous; i++) {
            previous = current;
            // Manual replacement for common HTML entities
            // Basic entities
            current = current
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&#039;/g, "'")
                .replace(/&#x27;/g, "'")
                .replace(/&#x2F;/g, "/")
                .replace(/&#39;/g, "'")
                .replace(/&apos;/g, "'");
            // Named entities for accented characters (common French/European characters)
            current = current
                .replace(/&eacute;/g, "é")
                .replace(/&Eacute;/g, "É")
                .replace(/&egrave;/g, "è")
                .replace(/&Egrave;/g, "È")
                .replace(/&ecirc;/g, "ê")
                .replace(/&Ecirc;/g, "Ê")
                .replace(/&euml;/g, "ë")
                .replace(/&Euml;/g, "Ë")
                .replace(/&agrave;/g, "à")
                .replace(/&Agrave;/g, "À")
                .replace(/&acirc;/g, "â")
                .replace(/&Acirc;/g, "Â")
                .replace(/&auml;/g, "ä")
                .replace(/&Auml;/g, "Ä")
                .replace(/&ccedil;/g, "ç")
                .replace(/&Ccedil;/g, "Ç")
                .replace(/&icirc;/g, "î")
                .replace(/&Icirc;/g, "Î")
                .replace(/&iuml;/g, "ï")
                .replace(/&Iuml;/g, "Ï")
                .replace(/&ocirc;/g, "ô")
                .replace(/&Ocirc;/g, "Ô")
                .replace(/&ouml;/g, "ö")
                .replace(/&Ouml;/g, "Ö")
                .replace(/&ucirc;/g, "û")
                .replace(/&Ucirc;/g, "Û")
                .replace(/&uuml;/g, "ü")
                .replace(/&Uuml;/g, "Ü");
            // Numeric entities for punctuation and special characters
            // Em-dash, en-dash, and various quotes
            current = current
                .replace(/&#8212;/g, "—") // em-dash
                .replace(/&#8211;/g, "–") // en-dash
                .replace(/&#8216;/g, "'") // left single quotation mark
                .replace(/&#8217;/g, "'") // right single quotation mark/apostrophe
                .replace(/&#8218;/g, "‚") // single low-9 quotation mark
                .replace(/&#8220;/g, '"') // left double quotation mark
                .replace(/&#8221;/g, '"') // right double quotation mark
                .replace(/&#8222;/g, "„") // double low-9 quotation mark
                .replace(/&#8230;/g, "…") // horizontal ellipsis
                .replace(/&#160;/g, " ") // non-breaking space
                .replace(/&nbsp;/g, " "); // non-breaking space (named)
            // Hex numeric entities for the same characters
            current = current
                .replace(/&#x2014;/g, "—") // em-dash
                .replace(/&#x2013;/g, "–") // en-dash
                .replace(/&#x2018;/g, "'") // left single quotation mark
                .replace(/&#x2019;/g, "'") // right single quotation mark
                .replace(/&#x201C;/g, '"') // left double quotation mark
                .replace(/&#x201D;/g, '"') // right double quotation mark
                .replace(/&#x2026;/g, "…") // horizontal ellipsis
                .replace(/&#xA0;/g, " "); // non-breaking space
            // Handle numeric entities for accented characters (common ones)
            current = current
                .replace(/&#233;/g, "é")
                .replace(/&#232;/g, "è")
                .replace(/&#234;/g, "ê")
                .replace(/&#235;/g, "ë")
                .replace(/&#224;/g, "à")
                .replace(/&#226;/g, "â")
                .replace(/&#228;/g, "ä")
                .replace(/&#231;/g, "ç")
                .replace(/&#238;/g, "î")
                .replace(/&#239;/g, "ï")
                .replace(/&#244;/g, "ô")
                .replace(/&#246;/g, "ö")
                .replace(/&#251;/g, "û")
                .replace(/&#252;/g, "ü");
            // Try URL decoding again in case of double encoding
            try {
                const urlDecoded = decodeURIComponent(current);
                if (urlDecoded !== current) {
                    current = urlDecoded;
                }
            }
            catch {
                // Not URL-encoded, continue
            }
        }
        // Finally, unescape JavaScript/JSON escape sequences
        return unescapeJsString(current);
    }
    catch {
        // If URL decoding fails, unescape HTML entities and JS escapes
        // Use a helper function to avoid code duplication
        let htmlUnescaped = text
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&#x27;/g, "'")
            .replace(/&#x2F;/g, "/")
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'");
        // Apply the same extended entity replacements
        htmlUnescaped = htmlUnescaped
            .replace(/&eacute;/g, "é")
            .replace(/&Eacute;/g, "É")
            .replace(/&egrave;/g, "è")
            .replace(/&Egrave;/g, "È")
            .replace(/&ecirc;/g, "ê")
            .replace(/&Ecirc;/g, "Ê")
            .replace(/&euml;/g, "ë")
            .replace(/&Euml;/g, "Ë")
            .replace(/&agrave;/g, "à")
            .replace(/&Agrave;/g, "À")
            .replace(/&acirc;/g, "â")
            .replace(/&Acirc;/g, "Â")
            .replace(/&auml;/g, "ä")
            .replace(/&Auml;/g, "Ä")
            .replace(/&ccedil;/g, "ç")
            .replace(/&Ccedil;/g, "Ç")
            .replace(/&icirc;/g, "î")
            .replace(/&Icirc;/g, "Î")
            .replace(/&iuml;/g, "ï")
            .replace(/&Iuml;/g, "Ï")
            .replace(/&ocirc;/g, "ô")
            .replace(/&Ocirc;/g, "Ô")
            .replace(/&ouml;/g, "ö")
            .replace(/&Ouml;/g, "Ö")
            .replace(/&ucirc;/g, "û")
            .replace(/&Ucirc;/g, "Û")
            .replace(/&uuml;/g, "ü")
            .replace(/&Uuml;/g, "Ü")
            .replace(/&#8212;/g, "—")
            .replace(/&#8211;/g, "–")
            .replace(/&#8216;/g, "'")
            .replace(/&#8217;/g, "'")
            .replace(/&#8220;/g, '"')
            .replace(/&#8221;/g, '"')
            .replace(/&#8230;/g, "…")
            .replace(/&#160;/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&#x2014;/g, "—")
            .replace(/&#x2013;/g, "–")
            .replace(/&#x2018;/g, "'")
            .replace(/&#x2019;/g, "'")
            .replace(/&#x201C;/g, '"')
            .replace(/&#x201D;/g, '"')
            .replace(/&#x2026;/g, "…")
            .replace(/&#xA0;/g, " ")
            .replace(/&#233;/g, "é")
            .replace(/&#232;/g, "è")
            .replace(/&#234;/g, "ê")
            .replace(/&#235;/g, "ë")
            .replace(/&#224;/g, "à")
            .replace(/&#226;/g, "â")
            .replace(/&#228;/g, "ä")
            .replace(/&#231;/g, "ç")
            .replace(/&#238;/g, "î")
            .replace(/&#239;/g, "ï")
            .replace(/&#244;/g, "ô")
            .replace(/&#246;/g, "ö")
            .replace(/&#251;/g, "û")
            .replace(/&#252;/g, "ü");
        return unescapeJsString(htmlUnescaped);
    }
}
