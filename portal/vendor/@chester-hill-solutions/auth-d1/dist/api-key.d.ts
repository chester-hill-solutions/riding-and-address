import type { ApiKeyAuthorizationActor, CapabilityId } from "@chester-hill-solutions/auth";
import type { DB } from "./schema.js";
import { type WorkspaceApiKeyRow } from "./api-key-schema.js";
export declare const DEFAULT_API_KEY_PREFIX = "chs_live";
export declare class ApiKeyError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(message: string, code: string, status?: number);
}
export type CreateApiKeyInput = {
    id?: string;
    workspaceId: string;
    /** Human label (e.g. "Production server"). */
    name: string;
    capabilities: ReadonlyArray<CapabilityId | string>;
    createdByUserId?: string;
    /** Key prefix segment (e.g. `chs_live`, `mm_test`). Defaults to `chs_live`. */
    keyPrefix?: string;
};
export type CreateApiKeyResult = {
    apiKey: WorkspaceApiKeyRow;
    /** Full raw key — return once to the caller; never store or log it. */
    rawKey: string;
};
/**
 * Issue a workspace API key. The raw key is `${keyPrefix}_${token}`; only its
 * SHA-256 hash is persisted.
 */
export declare function createApiKey(db: DB, input: CreateApiKeyInput): Promise<CreateApiKeyResult>;
/**
 * Resolve a raw presented key to an active API-key actor. Returns null when
 * the key is unknown or revoked. Touches `last_used_at` on success.
 */
export declare function verifyApiKey(db: DB, rawKey: string): Promise<ApiKeyAuthorizationActor | null>;
export declare function revokeApiKey(db: DB, keyId: string, workspaceId: string): Promise<boolean>;
export type RotateApiKeyResult = {
    apiKey: WorkspaceApiKeyRow;
    rawKey: string;
    revokedKeyId: string;
};
/**
 * Revoke the existing key and issue a replacement carrying the same name,
 * workspace, and capability allowlist. The old raw key stops working
 * immediately; the new raw key is returned exactly once.
 */
export declare function rotateApiKey(db: DB, keyId: string, options: {
    actorUserId?: string;
}): Promise<RotateApiKeyResult>;
export declare function listApiKeys(db: DB, workspaceId: string): Promise<WorkspaceApiKeyRow[]>;
