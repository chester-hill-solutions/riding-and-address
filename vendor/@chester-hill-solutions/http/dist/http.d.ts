export declare function jsonOk(body: unknown, init?: ResponseInit): Response;
export declare function jsonError(body: unknown, status?: number, init?: Omit<ResponseInit, "status">): Response;
export declare function redirectTo(path: string, headers?: Headers): Response;
/**
 * Merges session headers from multiple sources, properly handling set-cookie headers
 * which need to be appended rather than overwritten.
 */
export declare function mergeSessionHeaders(baseHeaders: Headers, newHeaders: Headers): Headers;
