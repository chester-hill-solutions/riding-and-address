import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadJobs } from '../src/upload-jobs';
import { ApiKeyUsageDO } from '../src/api-key-usage-do';
import type { Env } from '../src/types';
import type { UploadJob } from '../src/upload-sheet';

vi.mock('../src/lookup-expansion', () => ({
  performExpandedLookup: vi.fn(async (_env, _path, query: { address?: string }) => {
    if (query.address === 'Fail') throw new Error('No match');
    return { riding: 'Toronto Centre', point: { lat: 43.6, lon: -79.3 } };
  }),
  expandedLookupResponseFields: () => ({}),
}));

interface MemoryStorage {
  get(key: string | string[]): Promise<unknown>;
  put(key: string | Record<string, unknown>, value?: unknown): Promise<void>;
  delete(key: string | string[]): Promise<void>;
  list(opts: { prefix: string; limit?: number }): Promise<Map<string, unknown>>;
  setAlarm(time: number): Promise<void>;
  deleteAlarm(): Promise<void>;
  transaction<T>(fn: (txn: MemoryStorage) => Promise<T>): Promise<T>;
}
function memoryState() {
  let values = new Map<string, unknown>();
  let alarm: number | null = null;
  let tail: Promise<unknown> = Promise.resolve();
  const storage: MemoryStorage = {
    async get(key: string | string[]) {
      return typeof key === 'string' ? structuredClone(values.get(key)) :
        new Map(key.filter(k => values.has(k)).map(k => [k, structuredClone(values.get(k))]));
    },
    async put(key: string | Record<string, unknown>, value?: unknown) {
      for (const [k, v] of typeof key === 'string' ? [[key, value]] : Object.entries(key)) values.set(k as string, structuredClone(v));
    },
    async delete(key: string | string[]) { for (const k of typeof key === 'string' ? [key] : key) values.delete(k); },
    async list(opts: { prefix: string; limit?: number }) {
      return new Map([...values].filter(([key]) => key.startsWith(opts.prefix)).sort().slice(0, opts.limit).map(([key, value]) => [key, structuredClone(value)]));
    },
    async setAlarm(time: number) { alarm = time; },
    async deleteAlarm() { alarm = null; },
    async transaction<T>(fn: (txn: MemoryStorage) => Promise<T>): Promise<T> {
      const task = tail.then(async () => {
        const snapshot = structuredClone(values), previousAlarm = alarm;
        try { return await fn(storage); } catch (error) { values = snapshot; alarm = previousAlarm; throw error; }
      });
      tail = task.catch(() => undefined);
      return task;
    },
  };
  return { storage, state: { storage } as unknown as DurableObjectState };
}
const env = {} as Env;
const request = (op: string, id = '', body?: unknown) => new Request(`https://usage/uploads/${op}?id=${id}`,
  body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) });
async function create(service: UploadJobs, text: string) {
  const response = await service.handle(request('create', '', { text, name: 'test.csv', freeEligible: true }));
  expect(response.status).toBe(200);
  return response.json() as Promise<UploadJob>;
}
beforeEach(() => { vi.useRealTimers(); });

describe('durable upload payments and allowance', () => {
  it('keeps one shared reservation across clients and restarts, and restores it on cancellation', async () => {
    const { state, storage } = memoryState();
    const service = new UploadJobs(state, env);
    const job = await create(service, 'address\n123 Main\n456 Main');
    expect(await storage.get(`month:${job.month}`)).toBe(2);
    const restarted = new UploadJobs(state, env);
    expect((await restarted.handle(request('create', '', { text: 'address\nThird', name: 'another.csv', freeEligible: true }))).status).toBe(400);
    expect((await restarted.handle(request('cancel', job.id, {}))).status).toBe(200);
    expect(await storage.get(`month:${job.month}`)).toBe(0);
    expect((await create(restarted, 'address\nThird')).freeRows).toBe(1);
  });

  it('does not grant separate free pools to aliases claiming the same verified identity', async () => {
    const { state } = memoryState();
    const doStub = new ApiKeyUsageDO(state, env);
    const claim = async (customerId: string) => (await doStub.fetch(new Request('https://usage/claim-free', { method: 'POST', body: JSON.stringify({ customerId }) }))).json();
    expect(await claim('customer-a')).toEqual({ allowed: true });
    expect(await claim('customer-a')).toEqual({ allowed: true });
    expect(await claim('customer-b')).toEqual({ allowed: false });
  });

  it('verifies immutable checkout amounts, settles once after restart, and credits only failed paid rows', async () => {
    const { state, storage } = memoryState();
    await storage.put('month:' + new Date().toISOString().slice(0, 7), 1000);
    let service = new UploadJobs(state, env);
    const job = await create(service, 'address\nGood\nFail\nGood');
    expect(job).toMatchObject({ chargeCents: 50, freeRows: 0, paidRows: 3, extraCreditRows: 97 });
    await service.handle(request('start', job.id, { sessionId: 'cs_test_upload', customerId: 'cus_test', expiresAt: Date.now() + 3600_000 }));
    const session = { id: 'cs_test_upload', customer: 'cus_test', mode: 'payment', payment_status: 'paid', amount_total: 50, currency: 'usd' };
    for (const patch of [{ amount_total: 1 }, { currency: 'cad' }, { id: 'other' }, { customer: 'other' }, { mode: 'subscription' }, { payment_status: 'unpaid' }])
      expect((await service.handle(request('paid', job.id, { ...session, ...patch }))).status).toBe(400);
    expect((await service.handle(request('paid', job.id, session))).status).toBe(200);
    service = new UploadJobs(state, env);
    await service.handle(request('paid', job.id, session));
    expect(await storage.get('upload:credits')).toBe(97);
    await service.alarm();
    await service.alarm();
    const completed = await (await service.handle(request('get', job.id))).json();
    expect(completed).toMatchObject({ status: 'completed', successfulRows: 2, creditedRows: 1 });
    expect(await storage.get('upload:credits')).toBe(98);
    expect(await storage.get(`month:${job.month}`)).toBe(1002);
    await service.handle(request('paid', job.id, session));
    expect(await storage.get('upload:credits')).toBe(98);
  });

  it('skips invalid rows, returns failed free allowance and downloads neutralized original cells', async () => {
    const { state, storage } = memoryState();
    const service = new UploadJobs(state, env);
    const job = await create(service, 'name,address\n=1,Good\nOther,Fail\nEmpty,');
    expect(job).toMatchObject({ validRows: 2, invalidRows: 1, chargeCents: 0 });
    await service.handle(request('start', job.id, {})); await service.alarm();
    expect(await storage.get(`month:${job.month}`)).toBe(1);
    expect(await storage.get('upload:credits')).toBe(0);
    const response = await service.handle(request('download', job.id));
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.text()).toContain('"\'=1","Good","matched"');
  });

  it('expires abandoned quotes without leaking their reserved allowance', async () => {
    const { state, storage } = memoryState();
    const service = new UploadJobs(state, env), job = await create(service, 'address\nGood');
    vi.useFakeTimers(); vi.setSystemTime(job.createdAt + 31 * 60_000);
    await service.alarm();
    expect(await storage.get(`month:${job.month}`)).toBe(0);
    expect((await (await service.handle(request('get', job.id))).json() as UploadJob).status).toBe('expired');
  });
});
