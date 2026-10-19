/**
 * A KV namespace in memory.
 *
 * **One fake, one home.** This used to be `createMemoryKv` — private to
 * `test/helpers/lookup-test-env.ts` — plus seven byte-identical copies across the area and x402
 * tests, plus a variant in `test/cache-validation.test.ts` that was seeded with entries, plus four
 * more inline in `test/geocoding.test.ts`. Nine copies of a fake is nine places for it to be subtly
 * wrong, and two of them already were: one copy had no `list` prefix filtering and one always
 * answered `getWithMetadata` with `null` whatever was stored.
 *
 * It lives in `test/helpers/` rather than beside one suite because the portal needs it too, and the
 * portal can reach the root's `test/` directory directly — `portal/app/lib/cimd-fetch.ts` already
 * imports `../../../src/cimd-fetch`, so the same is true of a helper.
 *
 * **Values are stored as they are given.** A string stays a string and an object stays an object,
 * so a suite can seed a record and read it back as the object it wrote. Asking for JSON parses a
 * stored string, because that is what the real KV does with a JSON body.
 *
 * **The 512-byte key limit is enforced.** One copy of this fake had it, with the comment that
 * explained why: *"a fake that does not enforce it cannot catch a key that is too long — which is
 * how a 549-byte receipt key shipped with every write failing in production."* That is a property
 * of the real KV, so it belongs in the fake; it now applies to every suite rather than the one that
 * remembered to copy it.
 */
export function createMemoryKv(entries: Record<string, unknown> = {}): KVNamespace {
  const store = new Map<string, unknown>(Object.entries(entries));

  return {
    get: async (key: string, type?: string) => {
      const value = store.get(key);
      if (value === undefined) return null;
      if (type === 'json') {
        return typeof value === 'string' ? JSON.parse(value) : value;
      }
      return typeof value === 'string' ? value : JSON.stringify(value);
    },
    put: async (key: string, value: string) => {
      if (new TextEncoder().encode(key).length > 512) {
        throw new Error(`KV key too long: ${key.length} chars`);
      }
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async ({ prefix }: { prefix?: string } = {}) => ({
      keys: [...store.keys()]
        .filter((name) => !prefix || name.startsWith(prefix))
        .map((name) => ({ name })),
      list_complete: true,
      cacheStatus: null,
    }),
    getWithMetadata: async (key: string) => {
      const value = store.get(key);
      return {
        value: value === undefined ? null : value,
        metadata: null,
        cacheStatus: null,
      };
    },
  } as unknown as KVNamespace;
}

/**
 * A KV namespace whose contents a test can read back.
 *
 * The memory KV is a black box from the outside — a test can write and read, but cannot assert on
 * what is stored without going through the same API it is testing. This hands over the raw map, so
 * a test can say "the key is stored under this name, with this value" and mean it.
 */
export function createMemoryKvWithStore(
  entries: Record<string, unknown> = {}
): { kv: KVNamespace; store: Map<string, unknown> } {
  const kv = createMemoryKv(entries);
  const store = new Map<string, unknown>(Object.entries(entries));
  const originalPut = kv.put.bind(kv);
  const originalDelete = kv.delete.bind(kv);
  kv.put = (async (key: string, value: string) => {
    store.set(key, value);
    await originalPut(key, value);
  }) as KVNamespace['put'];
  kv.delete = (async (key: string) => {
    store.delete(key);
    await originalDelete(key);
  }) as KVNamespace['delete'];
  return { kv, store };
}
