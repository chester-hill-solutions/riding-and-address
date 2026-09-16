import { describe, it, expect, vi } from 'vitest';
import type { Env } from '../src/types';
import { createLookupTestEnv, fetchLookup } from './helpers/lookup-test-env';
import { createWebhook, createWebhookEvent } from '../src/webhooks';

/**
 * HTTP-level coverage for the single webhook-admin adapter. Both aliases
 * (`/webhooks/*` and `/api/webhooks/*`) must behave identically: same field set,
 * same redaction, same filters, and 401 before 404 on unknown sub-paths.
 */

function createWebhookEnv() {
  const store = new Map<string, unknown>();
  const get = vi.fn(async (key: string): Promise<unknown> => store.get(key) ?? null);
  const put = vi.fn(async (key: string, value: string): Promise<void> => {
    store.set(key, JSON.parse(value));
  });
  const remove = vi.fn(async (key: string): Promise<void> => {
    store.delete(key);
  });
  const env = {
    ...createLookupTestEnv(),
    WEBHOOKS: { get, put, delete: remove },
    BASIC_AUTH: 'admin:secret',
  } as unknown as Env;
  return { env, store };
}

const AUTH = { Authorization: `Basic ${btoa('admin:secret')}` };
const PREFIXES = ['/webhooks', '/api/webhooks'] as const;

describe('webhook admin surfaces', () => {
  it('requires admin auth before 404 on unknown sub-paths, for both aliases', async () => {
    const { env } = createWebhookEnv();
    for (const prefix of PREFIXES) {
      const res = await fetchLookup(env, `${prefix}/not-a-route`);
      expect(res.status, `${prefix}/not-a-route`).toBe(401);
    }
  });

  it('404s an authenticated unknown sub-path on both aliases', async () => {
    const { env } = createWebhookEnv();
    for (const prefix of PREFIXES) {
      const res = await fetchLookup(env, `${prefix}/not-a-route`, { headers: AUTH });
      expect(res.status, `${prefix}/not-a-route`).toBe(404);
    }
  });

  it('lists the same fields and never leaks the secret, on both aliases', async () => {
    const { env } = createWebhookEnv();
    const id = await createWebhook(env, {
      url: 'https://example.com/hook',
      secret: 'top-secret-value',
      events: ['batch.completed'],
      active: true,
    });

    for (const prefix of PREFIXES) {
      const res = await fetchLookup(env, prefix, { headers: AUTH });
      expect(res.status, `${prefix}`).toBe(200);
      const text = await res.text();
      expect(text, `${prefix} leaked the secret`).not.toContain('top-secret-value');
      const body = JSON.parse(text) as { webhooks: Array<Record<string, unknown>> };
      const webhook = body.webhooks.find((w) => w.id === id);
      expect(webhook, `${prefix} missing webhook`).toBeDefined();
      expect(webhook?.secret).toBe('***');
      expect(webhook?.maxFailures).toBeDefined();
    }
  });

  it('applies the same status filter to events on both aliases', async () => {
    const { env } = createWebhookEnv();
    const webhookId = await createWebhook(env, {
      url: 'https://example.com/hook',
      secret: 'shh',
      events: ['batch.completed'],
      active: true,
    });
    const deliverable = await createWebhookEvent(env, webhookId, 'batch.completed', 'batch_1', {});
    await createWebhookEvent(env, webhookId, 'batch.completed', 'batch_2', {});

    for (const prefix of PREFIXES) {
      const all = await fetchLookup(env, `${prefix}/events`, { headers: AUTH });
      const allBody = (await all.json()) as { events: Array<{ id: string }> };
      expect(allBody.events.length, `${prefix} all events`).toBe(2);

      const filtered = await fetchLookup(env, `${prefix}/events?status=delivered`, { headers: AUTH });
      const filteredBody = (await filtered.json()) as { events: Array<{ id: string }> };
      // Newly created events default to a non-delivered status; the filter must match none of them.
      expect(filteredBody.events.some((e) => e.id === deliverable)).toBe(false);
    }
  });

  it('accepts a POST create on both aliases', async () => {
    const { env } = createWebhookEnv();
    for (const prefix of PREFIXES) {
      const res = await fetchLookup(env, prefix, {
        method: 'POST',
        headers: { ...AUTH, 'content-type': 'application/json' },
        body: JSON.stringify({ url: `https://example.com/${prefix}`, events: ['batch.completed'] }),
      });
      expect(res.status, `${prefix} POST`).toBe(200);
      const body = (await res.json()) as { webhookId?: string };
      expect(body.webhookId, `${prefix} POST`).toBeTruthy();
    }
  });
});
