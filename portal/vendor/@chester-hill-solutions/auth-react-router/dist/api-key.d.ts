import type { ApiKeyAuthorizationActor, CapabilityId } from "@chester-hill-solutions/auth";
export type ExtractApiKey = (request: Request) => string | null;
export type RequireApiKeyOptions = {
    /** Verify a presented raw key; null when unknown/revoked (e.g. `verifyApiKey` from auth-postgres). */
    verifyApiKey: (rawKey: string) => Promise<ApiKeyAuthorizationActor | null>;
    extractApiKey?: ExtractApiKey;
    /** Map invalid/missing keys to a Response. Default JSON 401. */
    onInvalid?: (args: {
        reason: "missing" | "unknown";
    }) => Response;
};
export type RequireApiKeyArgs = {
    request: Request;
    /** Enforced tenant binding — mismatched keys are rejected with 403. */
    workspaceId: string;
};
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
export declare function createRequireApiKeyActor(options: RequireApiKeyOptions): (args: RequireApiKeyArgs) => Promise<ApiKeyAuthorizationActor | Response>;
/** Convenience check for guard results that may be a rejection Response. */
export declare function isResponse(value: unknown): value is Response;
export type ApiKeyGuard = ReturnType<typeof createRequireApiKeyActor>;
export type { CapabilityId };
