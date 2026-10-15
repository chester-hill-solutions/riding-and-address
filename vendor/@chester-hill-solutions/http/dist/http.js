export function jsonOk(body, init) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (init?.headers) {
        const extra = new Headers(init.headers);
        extra.forEach((value, key) => {
            if (key.toLowerCase() === "set-cookie") {
                headers.append(key, value);
            }
            else {
                headers.set(key, value);
            }
        });
    }
    return new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers,
    });
}
export function jsonError(body, status = 400, init) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (init?.headers) {
        const extra = new Headers(init.headers);
        extra.forEach((value, key) => {
            if (key.toLowerCase() === "set-cookie") {
                headers.append(key, value);
            }
            else {
                headers.set(key, value);
            }
        });
    }
    return new Response(JSON.stringify(body), {
        status,
        headers,
    });
}
export function redirectTo(path, headers) {
    const redirectHeaders = headers ? new Headers(headers) : new Headers();
    redirectHeaders.set("Location", path);
    return new Response(null, { status: 302, headers: redirectHeaders });
}
/**
 * Merges session headers from multiple sources, properly handling set-cookie headers
 * which need to be appended rather than overwritten.
 */
export function mergeSessionHeaders(baseHeaders, newHeaders) {
    const merged = new Headers(baseHeaders);
    newHeaders.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") {
            merged.append(key, value);
        }
        else {
            merged.set(key, value);
        }
    });
    return merged;
}
