import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  readTimestampedEntry,
  writeTimestampedEntry,
  readJsonEntry,
  writeJsonEntry,
  deleteEntry,
  type KVNamespaceLike,
} from '../src/kv-cache';

interface Timestamped {
  timestamp: number;
  value: string;
}

/**
 * The port owns the KV protocol so consumers do not re-implement it. These tests pin the
 * protocol itself: expiry, TTL forwarding, absent-binding skip and the never-throw contract.
 */

function createNamespace(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial));
  const get = vi.fn(
    async (key: string, _type: 'json'): Promise<unknown> => store.get(key) ?? null
  );
  const put = vi.fn(
    async (key: string, value: string, _options?: { expirationTtl?: number }): Promise<void> => {
      store.set(key, JSON.parse(value));
    }
  );
  const remove = vi.fn(async (key: string): Promise<void> => {
    store.delete(key);
  });
  const namespace: KVNamespaceLike = { get, put, delete: remove };
  return { namespace, store, get, put, remove };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe('readTimestampedEntry', () => {
  it('returns a fresh cached entry', async () => {
    const entry: Timestamped = { timestamp: Date.now(), value: 'fresh' };
    const { namespace } = createNamespace({ k: entry });

    await expect(readTimestampedEntry<Timestamped>(namespace, 'k', 1000, 'test')).resolves.toEqual(entry);
  });

  it('returns null once the entry is older than maxAgeMs', async () => {
    const entry: Timestamped = { timestamp: Date.now() - 5000, value: 'stale' };
    const { namespace } = createNamespace({ k: entry });

    await expect(readTimestampedEntry<Timestamped>(namespace, 'k', 1000, 'test')).resolves.toBeNull();
  });

  it('returns null for a missing key', async () => {
    const { namespace } = createNamespace();

    await expect(readTimestampedEntry<Timestamped>(namespace, 'k', 1000, 'test')).resolves.toBeNull();
  });

  it('returns null when the binding is absent, without touching a namespace', async () => {
    await expect(readTimestampedEntry<Timestamped>(undefined, 'k', 1000, 'test')).resolves.toBeNull();
  });

  it('resolves to null when get throws instead of rejecting', async () => {
    const { namespace, get } = createNamespace();
    get.mockRejectedValueOnce(new Error('KV unavailable'));

    await expect(readTimestampedEntry<Timestamped>(namespace, 'k', 1000, 'test')).resolves.toBeNull();
  });
});

describe('writeTimestampedEntry', () => {
  it('forwards expirationTtl to the namespace', async () => {
    const { namespace, put } = createNamespace();
    const entry: Timestamped = { timestamp: Date.now(), value: 'x' };

    await writeTimestampedEntry(namespace, 'k', entry, 3600, 'test');

    expect(put).toHaveBeenCalledWith('k', JSON.stringify(entry), { expirationTtl: 3600 });
  });

  it('is a no-op with an absent binding', async () => {
    await expect(writeTimestampedEntry(undefined, 'k', { timestamp: Date.now(), value: 'x' }, 60, 'test')).resolves.toBeUndefined();
  });

  it('does not reject when put throws', async () => {
    const { namespace, put } = createNamespace();
    put.mockRejectedValueOnce(new Error('KV write failed'));

    await expect(
      writeTimestampedEntry(namespace, 'k', { timestamp: Date.now(), value: 'x' }, 60, 'test')
    ).resolves.toBeUndefined();
  });
});

describe('readJsonEntry', () => {
  it('returns the stored value', async () => {
    const { namespace } = createNamespace({ k: { a: 1 } });

    await expect(readJsonEntry<{ a: number }>(namespace, 'k')).resolves.toEqual({ a: 1 });
  });

  it('returns null for a missing key', async () => {
    const { namespace } = createNamespace();

    await expect(readJsonEntry(namespace, 'k')).resolves.toBeNull();
  });

  it('returns null when the binding is absent', async () => {
    await expect(readJsonEntry(undefined, 'k')).resolves.toBeNull();
  });

  it('resolves to null when get throws instead of rejecting', async () => {
    const { namespace, get } = createNamespace();
    get.mockRejectedValueOnce(new Error('KV unavailable'));

    await expect(readJsonEntry(namespace, 'k')).resolves.toBeNull();
  });
});

describe('writeJsonEntry', () => {
  it('stores the JSON-serialized value', async () => {
    const { namespace, put } = createNamespace();

    await writeJsonEntry(namespace, 'k', { a: 1 });

    expect(put).toHaveBeenCalledWith('k', JSON.stringify({ a: 1 }));
  });

  it('forwards expirationTtl when a TTL is given', async () => {
    const { namespace, put } = createNamespace();

    await writeJsonEntry(namespace, 'k', ['a', 'b'], 300);

    expect(put).toHaveBeenCalledWith('k', JSON.stringify(['a', 'b']), { expirationTtl: 300 });
  });

  it('is a no-op with an absent binding', async () => {
    await expect(writeJsonEntry(undefined, 'k', { a: 1 })).resolves.toBeUndefined();
  });

  it('does not reject when put throws', async () => {
    const { namespace, put } = createNamespace();
    put.mockRejectedValueOnce(new Error('KV write failed'));

    await expect(writeJsonEntry(namespace, 'k', { a: 1 })).resolves.toBeUndefined();
  });
});

describe('deleteEntry', () => {
  it('deletes the key through the namespace', async () => {
    const { namespace, store, remove } = createNamespace({ k: { a: 1 } });

    await deleteEntry(namespace, 'k');

    expect(remove).toHaveBeenCalledWith('k');
    expect(store.has('k')).toBe(false);
  });

  it('is a no-op with an absent binding', async () => {
    await expect(deleteEntry(undefined, 'k')).resolves.toBeUndefined();
  });

  it('swallows errors instead of rejecting', async () => {
    const { namespace, remove } = createNamespace();
    remove.mockRejectedValueOnce(new Error('KV delete failed'));

    await expect(deleteEntry(namespace, 'k')).resolves.toBeUndefined();
  });
});
