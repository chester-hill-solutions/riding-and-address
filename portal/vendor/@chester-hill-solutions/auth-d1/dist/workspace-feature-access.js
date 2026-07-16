import { and, eq, isNull, or } from "drizzle-orm";
import { workspaceFeaturePermissions } from "./workspace-authz-schema.js";
import { getWorkspaceMemberRoleId } from "./workspace-access.js";
const DEFAULT_CACHE_TTL_MS = 60_000;
const permissionCache = new Map();
export class WorkspaceFeatureAccessError extends Error {
    constructor(message = "Insufficient workspace permissions") {
        super(message);
        this.name = "WorkspaceFeatureAccessError";
    }
}
export function clearWorkspaceFeaturePermissionCache() {
    permissionCache.clear();
}
function cacheKey(workspaceId, roleId, featureId) {
    return `${workspaceId}:${roleId}:${featureId}`;
}
/**
 * D1/SQLite has no server-side function catalog, so this mirrors the Postgres
 * `check_workspace_feature_permission` RPC as a portable Drizzle query: fetch the
 * candidate rows (workspace-specific + global) in one query, then prefer the
 * workspace-specific row over the global (`workspace_id IS NULL`) default in JS.
 */
export async function checkWorkspaceFeaturePermission(db, params) {
    const rows = await db
        .select({
        workspaceId: workspaceFeaturePermissions.workspaceId,
        allowed: workspaceFeaturePermissions.allowed,
    })
        .from(workspaceFeaturePermissions)
        .where(and(eq(workspaceFeaturePermissions.roleId, params.roleId), eq(workspaceFeaturePermissions.featureId, params.featureId), or(isNull(workspaceFeaturePermissions.workspaceId), eq(workspaceFeaturePermissions.workspaceId, params.workspaceId))));
    if (rows.length === 0)
        return false;
    const specific = rows.find((row) => row.workspaceId === params.workspaceId);
    const fallback = specific ?? rows.find((row) => row.workspaceId === null);
    return fallback?.allowed === true;
}
export async function canAccessWorkspaceFeature(db, params, options) {
    const roleId = await getWorkspaceMemberRoleId(db, params);
    if (!roleId)
        return false;
    const ttl = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    const key = cacheKey(params.workspaceId, roleId, params.featureId);
    if (!options?.bypassCache) {
        const cached = permissionCache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.allowed;
        }
    }
    let allowed = false;
    try {
        allowed = await checkWorkspaceFeaturePermission(db, {
            workspaceId: params.workspaceId,
            roleId,
            featureId: params.featureId,
        });
    }
    catch {
        return false;
    }
    permissionCache.set(key, { allowed, expiresAt: Date.now() + ttl });
    return allowed;
}
export function createRequireWorkspaceFeature(featureId) {
    return async (db, params) => {
        const allowed = await canAccessWorkspaceFeature(db, { ...params, featureId });
        if (!allowed) {
            throw new WorkspaceFeatureAccessError();
        }
    };
}
export { getWorkspaceMemberRoleId };
