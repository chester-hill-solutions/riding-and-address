/**
 * Timestamped JSON entry cache over a KV namespace.
 *
 * Owns the protocol every cache here had hand-rolled: skip silently when the
 * binding is absent, read typed JSON, expire by entry timestamp, never let a
 * cache error fail a request.
 *
 * A caller may pass a Zod schema. A value that does not match is discarded as a miss rather than
 * cast — a record written by an older shape (or a corrupted one) must never be trusted just
 * because it parses as JSON. See docs/adr/0005-billing-invariants-gate.md.
 */

import type { ZodType } from 'zod';

export interface KVNamespaceLike {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export type TimestampedEntry = { timestamp: number };

export async function readTimestampedEntry<T extends TimestampedEntry>(
  namespace: KVNamespaceLike | undefined,
  key: string,
  maxAgeMs: number,
  label: string,
  schema?: ZodType<T>
): Promise<T | null> {
  if (!namespace) return null;

  try {
    const raw = await namespace.get(key, 'json');
    if (raw == null) return null;
    if (schema) {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        console.warn(`Discarding malformed cached ${label} at ${key}: ${parsed.error.message}`);
        return null;
      }
      if (Date.now() - parsed.data.timestamp > maxAgeMs) return null;
      return parsed.data;
    }
    const cached = raw as T;
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

/**
 * Raw JSON entry cache: for callers that own their entry shape and TTL policy
 * (config records, index arrays) rather than the timestamped family. Same
 * never-throw / absent-binding semantics as the timestamped helpers.
 */
export async function readJsonEntry<T>(
  namespace: KVNamespaceLike | undefined,
  key: string,
  schema?: ZodType<T>
): Promise<T | null> {
  if (!namespace) return null;

  try {
    const value = await namespace.get(key, 'json');
    if (value == null) return null;
    if (schema) {
      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        console.warn(`Discarding malformed cached entry ${key}: ${parsed.error.message}`);
        return null;
      }
      return parsed.data;
    }
    return value as T;
  } catch (error) {
    console.warn(`Failed to get cached entry ${key}:`, error);
    return null;
  }
}

export async function writeJsonEntry<T>(
  namespace: KVNamespaceLike | undefined,
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  if (!namespace) return;

  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds === undefined) {
      await namespace.put(key, serialized);
    } else {
      await namespace.put(key, serialized, { expirationTtl: ttlSeconds });
    }
  } catch (error) {
    console.warn(`Failed to cache entry ${key}:`, error);
    // Don't throw - cache errors should never fail requests
  }
}

export async function deleteEntry(
  namespace: KVNamespaceLike | undefined,
  key: string
): Promise<void> {
  if (!namespace) return;

  try {
    await namespace.delete(key);
  } catch (error) {
    console.warn(`Failed to delete cached entry ${key}:`, error);
    // Don't throw - cache errors should never fail requests
  }
}
