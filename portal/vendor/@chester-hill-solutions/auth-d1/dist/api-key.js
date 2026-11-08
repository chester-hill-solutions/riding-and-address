import { and, eq } from "drizzle-orm";
import { generateOpaqueToken, hashOpaqueToken } from "@chester-hill-solutions/auth";
import { workspaceApiKeys } from "./api-key-schema.js";
export const DEFAULT_API_KEY_PREFIX = "chs_live";
/** Chars of the raw key kept in cleartext for display/lookup hints. */
const DISPLAY_PREFIX_LENGTH = 16;
export class ApiKeyError extends Error {
    code;
    status;
    constructor(message, code, status = 400) {
        super(message);
        this.name = "ApiKeyError";
        this.code = code;
        this.status = status;
    }
}
function newId() {
    return `wak_${crypto.randomUUID()}`;
}
/**
 * Issue a workspace API key. The raw key is `${keyPrefix}_${token}`; only its
 * SHA-256 hash is persisted.
 */
export async function createApiKey(db, input) {
    if (input.name.trim().length === 0) {
        throw new ApiKeyError("API key name is required", "API_KEY_INVALID_NAME");
    }
    const keyPrefix = input.keyPrefix ?? DEFAULT_API_KEY_PREFIX;
    const rawKey = `${keyPrefix}_${generateOpaqueToken()}`;
    const now = new Date();
    const [apiKey] = await db
        .insert(workspaceApiKeys)
        .values({
        id: input.id ?? newId(),
        workspaceId: input.workspaceId,
        name: input.name.trim(),
        keyHash: hashOpaqueToken(rawKey),
        displayPrefix: rawKey.slice(0, DISPLAY_PREFIX_LENGTH),
        capabilities: [...input.capabilities],
        status: "active",
        createdByUserId: input.createdByUserId ?? null,
        createdAt: now,
        updatedAt: now,
    })
        .returning();
    if (!apiKey) {
        throw new ApiKeyError("Failed to create API key", "API_KEY_CREATE_FAILED", 500);
    }
    return { apiKey, rawKey };
}
/**
 * Resolve a raw presented key to an active API-key actor. Returns null when
 * the key is unknown or revoked. Touches `last_used_at` on success.
 */
export async function verifyApiKey(db, rawKey) {
    if (rawKey.length === 0)
        return null;
    const keyHash = hashOpaqueToken(rawKey);
    const [row] = await db
        .select()
        .from(workspaceApiKeys)
        .where(and(eq(workspaceApiKeys.keyHash, keyHash), eq(workspaceApiKeys.status, "active")))
        .limit(1);
    if (!row)
        return null;
    await db
        .update(workspaceApiKeys)
        .set({ lastUsedAt: new Date(), updatedAt: new Date() })
        .where(eq(workspaceApiKeys.id, row.id));
    return {
        type: "api_key",
        keyId: row.id,
        workspaceId: row.workspaceId,
        capabilities: new Set(row.capabilities),
    };
}
export async function revokeApiKey(db, keyId, workspaceId) {
    const updated = await db
        .update(workspaceApiKeys)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(and(eq(workspaceApiKeys.id, keyId), eq(workspaceApiKeys.workspaceId, workspaceId), eq(workspaceApiKeys.status, "active")))
        .returning({ id: workspaceApiKeys.id });
    return updated.length > 0;
}
/**
 * Revoke the existing key and issue a replacement carrying the same name,
 * workspace, and capability allowlist. The old raw key stops working
 * immediately; the new raw key is returned exactly once.
 */
export async function rotateApiKey(db, keyId, options) {
    const [existing] = await db
        .select()
        .from(workspaceApiKeys)
        .where(and(eq(workspaceApiKeys.id, keyId), eq(workspaceApiKeys.status, "active")))
        .limit(1);
    if (!existing) {
        throw new ApiKeyError("Active API key not found", "API_KEY_NOT_FOUND", 404);
    }
    const revoked = await revokeApiKey(db, existing.id, existing.workspaceId);
    if (!revoked) {
        throw new ApiKeyError("Failed to revoke previous key", "API_KEY_ROTATE_FAILED", 500);
    }
    const created = await createApiKey(db, {
        workspaceId: existing.workspaceId,
        name: existing.name,
        capabilities: existing.capabilities,
        createdByUserId: options.actorUserId ?? existing.createdByUserId ?? undefined,
    });
    return { ...created, revokedKeyId: existing.id };
}
export async function listApiKeys(db, workspaceId) {
    return db
        .select()
        .from(workspaceApiKeys)
        .where(eq(workspaceApiKeys.workspaceId, workspaceId));
}
