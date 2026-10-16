/**
 * Generic request and FormData helpers (framework-agnostic).
 */
export function getRequestUrl(request) {
    return new URL(request.url);
}
export function getRequestOrigin(request) {
    return getRequestUrl(request).origin;
}
export function getSearchParam(request, name) {
    return getRequestUrl(request).searchParams.get(name);
}
export function getSearchParams(request) {
    return getRequestUrl(request).searchParams;
}
export function getStringField(formData, name, options = { trim: true }) {
    const raw = formData.get(name);
    let value = raw == null ? "" : String(raw);
    if (options.trim ?? true) {
        value = value.trim();
    }
    if (options.lowercase) {
        value = value.toLowerCase();
    }
    return value;
}
export function getOptionalStringField(formData, name, options = { trim: true }) {
    const value = getStringField(formData, name, options);
    return value === "" ? null : value;
}
export function getBooleanField(formData, name) {
    const raw = formData.get(name);
    if (raw == null)
        return false;
    const value = String(raw).toLowerCase();
    return value === "on" || value === "true" || value === "1";
}
export function getIntField(formData, name) {
    const raw = formData.get(name);
    if (raw == null)
        return null;
    const parsed = Number.parseInt(String(raw), 10);
    return Number.isFinite(parsed) ? parsed : null;
}
export function getFloatField(formData, name) {
    const raw = formData.get(name);
    if (raw == null)
        return null;
    const str = String(raw).trim();
    if (str === "")
        return null;
    const parsed = Number.parseFloat(str);
    return Number.isFinite(parsed) ? parsed : null;
}
export function decodeParamUntilStable(value) {
    let current = value;
    for (;;) {
        try {
            const next = decodeURIComponent(current);
            if (next === current)
                return next;
            current = next;
        }
        catch {
            return current;
        }
    }
}
export function getPaginationParams(searchParams, options) {
    const pageParam = searchParams.get("page");
    const page = pageParam ? Number.parseInt(pageParam, 10) : undefined;
    const pageSizeParam = searchParams.get("pageSize");
    let pageSize = pageSizeParam ? Number.parseInt(pageSizeParam, 10) : undefined;
    const max = typeof options?.maxPageSize === "number" &&
        Number.isFinite(options.maxPageSize) &&
        options.maxPageSize > 0
        ? Math.trunc(options.maxPageSize)
        : null;
    if (max && typeof pageSize === "number" && Number.isFinite(pageSize)) {
        pageSize = Math.min(pageSize, max);
    }
    return { page, pageSize };
}
export function getSortParams(searchParams) {
    const sortBy = searchParams.get("sortBy") || undefined;
    const sortOrder = searchParams.get("sortOrder") || undefined;
    return { sortBy, sortOrder };
}
export function getSearchTerm(searchParams, paramName = "search") {
    const term = searchParams.get(paramName);
    if (term == null || term === "")
        return undefined;
    const trimmed = term.trim();
    return trimmed === "" ? undefined : trimmed;
}
