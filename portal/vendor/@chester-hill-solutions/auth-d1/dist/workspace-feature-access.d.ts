import type { DB } from "./schema.js";
import { getWorkspaceMemberRoleId } from "./workspace-access.js";
export declare class WorkspaceFeatureAccessError extends Error {
    constructor(message?: string);
}
export declare function clearWorkspaceFeaturePermissionCache(): void;
/**
 * D1/SQLite has no server-side function catalog, so this mirrors the Postgres
 * `check_workspace_feature_permission` RPC as a portable Drizzle query: fetch the
 * candidate rows (workspace-specific + global) in one query, then prefer the
 * workspace-specific row over the global (`workspace_id IS NULL`) default in JS.
 */
export declare function checkWorkspaceFeaturePermission(db: DB, params: {
    workspaceId: string;
    roleId: string;
    featureId: string;
}): Promise<boolean>;
export declare function canAccessWorkspaceFeature(db: DB, params: {
    workspaceId: string;
    userId: string;
    featureId: string;
}, options?: {
    cacheTtlMs?: number;
    bypassCache?: boolean;
}): Promise<boolean>;
export declare function createRequireWorkspaceFeature(featureId: string): (db: DB, params: {
    workspaceId: string;
    userId: string;
}) => Promise<void>;
export { getWorkspaceMemberRoleId };
