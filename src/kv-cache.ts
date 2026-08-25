/**
 * Timestamped JSON entry cache over a KV namespace.
 *
 * Owns the protocol every cache here had hand-rolled: skip silently when the
 * binding is absent, read typed JSON, expire by entry timestamp, never let a
 * cache error fail a request.
 */

export interface KVNamespaceLike {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export type TimestampedEntry = { timestamp: number };

export async function readTimestampedEntry<T extends TimestampedEntry>(
  namespace: KVNamespaceLike | undefined,
  key: string,
  maxAgeMs: number,
  label: string
): Promise<T | null> {
  if (!namespace) return null;

  try {
    const cached = (await namespace.get(key, 'json')) as T | null;
    if (!cached) return null;
    if (Date.now() - cached.timestamp > maxAgeMs) return null;
    return cached;
  } catch (error) {
    console.warn(`Failed to get cached ${label}:`, error);
    return null;
  }
}

export async function writeTimestampedEntry<T extends TimestampedEntry>(
  namespace: KVNamespaceLike | undefined,
  key: string,
  entry: T,
  ttlSeconds: number,
  label: string
): Promise<void> {
  if (!namespace) return;

  try {
    await namespace.put(key, JSON.stringify(entry), { expirationTtl: ttlSeconds });
  } catch (error) {
    console.warn(`Failed to cache ${label}:`, error);
    // Don't throw - cache errors should never fail requests
  }
}
