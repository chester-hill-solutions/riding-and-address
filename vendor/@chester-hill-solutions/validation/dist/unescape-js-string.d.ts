/**
 * Unescape JavaScript/JSON escape sequences (e.g., \' -> ', \" -> ", \\ -> \).
 * Also handles Unicode escape sequences (e.g., \u00E9 -> e) and repeated escaping.
 */
export declare function unescapeJsString(text: string): string;
