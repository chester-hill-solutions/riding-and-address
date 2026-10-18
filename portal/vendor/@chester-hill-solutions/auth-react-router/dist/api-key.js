const DEFAULT_EXTRACTORS = [
    (request) => {
        const authorization = request.headers.get("authorization");
        if (!authorization)
            return null;
        const [scheme, ...rest] = authorization.split(" ");
        if (scheme?.toLowerCase() !== "bearer" || rest.length === 0)
            return null;
        return rest.join(" ").trim() || null;
    },
    (request) => request.headers.get("x-api-key")?.trim() || null,
];
/**
 * Resolve a request's API key into an ApiKeyAuthorizationActor bound to the
 * given workspace. Combine with `createRequireCapability` to enforce
 * capability checks on top:
 *
 * ```ts
 * const requireApiKey = createRequireApiKeyActor({ verifyApiKey });
 * const requireCapability = createRequireCapability({
 *   capabilityId: "contacts.read",
 *   resolveActor: async ({ request }) => {
 *     const actor = await requireApiKey({ request, workspaceId: params.workspaceId });
 *     if (actor instanceof Response) return actor;
 *     return actor;
 *   },
 * });
 * ```
 */
export function createRequireApiKeyActor(options) {
    const extractors = options.extractApiKey
        ? [options.extractApiKey]
        : DEFAULT_EXTRACTORS;
    return async function requireApiKeyActor(args) {
        let rawKey = null;
        for (const extract of extractors) {
            rawKey = extract(args.request);
            if (rawKey)
                break;
        }
        if (!rawKey) {
            if (options.onInvalid)
                return options.onInvalid({ reason: "missing" });
            return Response.json({ error: "Missing API key" }, { status: 401 });
        }
        const actor = await options.verifyApiKey(rawKey);
        if (!actor) {
            if (options.onInvalid)
                return options.onInvalid({ reason: "unknown" });
            return Response.json({ error: "Invalid API key" }, { status: 401 });
        }
        if (actor.workspaceId !== args.workspaceId) {
            return Response.json({ error: "API key does not belong to this workspace" }, { status: 403 });
        }
        return actor;
    };
}
/** Convenience check for guard results that may be a rejection Response. */
export function isResponse(value) {
    return value instanceof Response;
}
