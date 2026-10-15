/**
 * Unescape JavaScript/JSON escape sequences (e.g., \' -> ', \" -> ", \\ -> \).
 * Also handles Unicode escape sequences (e.g., \u00E9 -> e) and repeated escaping.
 */
export function unescapeJsString(text) {
    let result = text;
    result = result.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
        return String.fromCharCode(Number.parseInt(hex, 16));
    });
    let previous = "";
    const maxIterations = 100;
    let iterations = 0;
    while (result !== previous && iterations < maxIterations) {
        iterations++;
        previous = result;
        result = result.replace(/\\\\/g, "\\");
    }
    return result
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r")
        .replace(/\\b/g, "\b")
        .replace(/\\f/g, "\f");
}
