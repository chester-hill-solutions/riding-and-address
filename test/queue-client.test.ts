import { describe, it, expect } from 'vitest';
import {
  submitBatch,
  getBatchStatus,
  getJob,
  getStats,
  retryFailed,
  processJobs,
  listDeadLetter,
  retryDeadLetter
} from '../src/queue-client';

function mockQueueManager(expectedPath: string, respond: (body: unknown) => unknown, method = 'POST') {
  const captured = { path: '', body: undefined as unknown };
  const stub = {
    fetch: async (request: Request) => {
      const url = new URL(request.url);
      captured.path = url.pathname + url.search;
      const body = request.method === 'POST' ? await request.json() : undefined;
      captured.body = body;
      if (url.pathname !== expectedPath || request.method !== method) {
        return new Response(JSON.stringify({ error: `unexpected ${request.method} ${url.pathname}` }), { status: 404 });
      }
      return new Response(JSON.stringify(respond(body)), { status: 200 });
    }
  };
  const env = {
    QUEUE_MANAGER: {
      idFromName: () => 'do-id',
      get: () => stub
    }
  };
  return { env, captured } as never as { env: never; captured: typeof captured };
}

describe('queue client', () => {
  it('submitBatch preserves the full QueryParams shape on the wire', async () => {
    // The drift this guards against: queued jobs losing return/include_province.
    const query = {
      postal: 'M5V 2T6',
      country: 'Canada',
      return: 'municipality',
      returnFields: ['municipality'],
      include_province: 'true',
      includeProvince: true,
      geocode_method: 'auto',
      geocodeMethod: 'auto' as const
    };
    const { env, captured } = mockQueueManager('/queue/submit', () => ({ batchId: 'b1', status: 'pending' }));
    const result = await submitBatch(env as never, [
      { id: 'q1', query, pathname: '/api/federal' }
    ]);

    expect(result).toEqual({ batchId: 'b1', status: 'pending' });
    expect(captured.path).toBe('/queue/submit');
    const sent = (captured.body as { requests: { query: Record<string, unknown> }[] }).requests[0].query;
    expect(sent.return).toBe('municipality');
    expect(sent.include_province).toBe('true');
    expect(sent.includeProvince).toBe(true);
    expect(sent.geocode_method).toBe('auto');
  });

  it('extracts the DO error envelope into a thrown message', async () => {
    const stub = {
      fetch: async () => new Response(JSON.stringify({ error: 'fuse blown' }), { status: 500 })
    };
    const env = { QUEUE_MANAGER: { idFromName: () => 'x', get: () => stub } };
    await expect(submitBatch(env as never, [])).rejects.toThrow('fuse blown');
  });

  it('routes each operation to its DO endpoint', async () => {
    const cases: [string, string, string, (env: never) => Promise<unknown>][] = [
      ['GET', '/queue/status?batchId=b9', 'status', (e) => getBatchStatus(e, 'b9')],
      ['GET', '/queue/job?id=j7', 'job', (e) => getJob(e, 'j7')],
      ['GET', '/queue/stats', 'stats', (e) => getStats(e)],
      ['POST', '/queue/retry', 'retryFailed', (e) => retryFailed(e, ['j1'])],
      ['POST', '/queue/process', 'processJobs', (e) => processJobs(e, 3)],
      ['GET', '/queue/dead-letter?limit=10&offset=5', 'deadLetter', (e) => listDeadLetter(e, 10, 5)],
      ['POST', '/queue/retry-dead-letter', 'retryDeadLetter', (e) => retryDeadLetter(e, ['j2'], { resetAttempts: false })]
    ];
    for (const [method, path] of cases) {
      const seen: string[] = [];
      const stub = {
        fetch: async (request: Request) => {
          const url = new URL(request.url);
          seen.push(request.method + ' ' + url.pathname + url.search);
          return new Response('{}', { status: 200 });
        }
      };
      const env = { QUEUE_MANAGER: { idFromName: () => 'x', get: () => stub } };
      const fn = cases.find((c) => c[1] === path)![3];
      await fn(env as never);
      void method;
      expect(seen[0]).toBe(`${method} ${path}`);
    }
    expect(cases.length).toBe(7);
  });

  it('throws when QUEUE_MANAGER binding is absent', async () => {
    await expect(submitBatch({} as never, [])).rejects.toThrow('Queue manager not configured');
  });

  it('processJobs defaults to ten jobs', async () => {
    const calls: Request[] = [];
    const stub = {
      fetch: async (request: Request) => {
        calls.push(request);
        return new Response('{}', { status: 200 });
      }
    };
    const env = { QUEUE_MANAGER: { idFromName: () => 'x', get: () => stub } };
    await processJobs(env as never);
    expect(await calls[0].json()).toEqual({ maxJobs: 10 });
  });
});
