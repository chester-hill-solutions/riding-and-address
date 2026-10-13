import { describe, it, expect, vi } from 'vitest';
import {
  generateWebhookId,
  generateEventId,
  generateDeliveryId,
  createWebhookSignature,
  truncateWebhookResponseBody,
  shouldScheduleWebhookRetry,
  createWebhook,
  deleteWebhook,
  getWebhook,
  createWebhookEvent,
  cleanupWebhookData,
  getWebhookEvents,
  WEBHOOK_CONFIG
} from '../src/webhooks';
import type { Env, WebhookConfig, WebhookEvent } from '../src/types';

function createWebhookEnv() {
  const store = new Map<string, unknown>();
  const get = vi.fn(async (key: string): Promise<unknown> => store.get(key) ?? null);
  const put = vi.fn(async (key: string, value: string): Promise<void> => {
    store.set(key, JSON.parse(value));
  });
  const remove = vi.fn(async (key: string): Promise<void> => {
    store.delete(key);
  });
  const env = { WEBHOOKS: { get, put, delete: remove } } as unknown as Env;
  return { env, store, get, put, remove };
}

const WEBHOOK_CONFIG_INPUT = {
  url: 'https://example.com/hook',
  secret: 'shh',
  events: ['batch.completed'],
  active: true
};

describe('generateWebhookId', () => {
  it('generates a string starting with webhook_', () => {
    const id = generateWebhookId();
    expect(id.startsWith('webhook_')).toBe(true);
  });

  it('generates unique ids', () => {
    const id1 = generateWebhookId();
    const id2 = generateWebhookId();
    expect(id1).not.toBe(id2);
  });
});

describe('generateEventId', () => {
  it('generates a string starting with event_', () => {
    const id = generateEventId();
    expect(id.startsWith('event_')).toBe(true);
  });

  it('generates unique ids', () => {
    const id1 = generateEventId();
    const id2 = generateEventId();
    expect(id1).not.toBe(id2);
  });
});

describe('generateDeliveryId', () => {
  it('generates a string starting with delivery_', () => {
    const id = generateDeliveryId();
    expect(id.startsWith('delivery_')).toBe(true);
  });

  it('generates unique ids', () => {
    const id1 = generateDeliveryId();
    const id2 = generateDeliveryId();
    expect(id1).not.toBe(id2);
  });
});

describe('createWebhookSignature', () => {
  it('generates a sha256= prefixed signature', async () => {
    const signature = await createWebhookSignature('secret', 'payload');
    expect(signature.startsWith('sha256=')).toBe(true);
  });

  it('generates consistent signatures for same inputs', async () => {
    const signature1 = await createWebhookSignature('secret', 'payload');
    const signature2 = await createWebhookSignature('secret', 'payload');
    expect(signature1).toBe(signature2);
  });

  it('generates different signatures for different secrets', async () => {
    const signature1 = await createWebhookSignature('secret1', 'payload');
    const signature2 = await createWebhookSignature('secret2', 'payload');
    expect(signature1).not.toBe(signature2);
  });

  it('generates different signatures for different payloads', async () => {
    const signature1 = await createWebhookSignature('secret', 'payload1');
    const signature2 = await createWebhookSignature('secret', 'payload2');
    expect(signature1).not.toBe(signature2);
  });

  it('generates a 64-character hex hash after prefix', async () => {
    const signature = await createWebhookSignature('secret', 'payload');
    const hash = signature.replace('sha256=', '');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('WEBHOOK_CONFIG', () => {
  it('has correct default values', () => {
    expect(WEBHOOK_CONFIG.ENABLED).toBe(true);
    expect(WEBHOOK_CONFIG.MAX_RETRY_ATTEMPTS).toBe(5);
    expect(WEBHOOK_CONFIG.RETRY_DELAY).toBe(5000);
    expect(WEBHOOK_CONFIG.TIMEOUT).toBe(30000);
    expect(WEBHOOK_CONFIG.MAX_WEBHOOKS).toBe(10);
    expect(WEBHOOK_CONFIG.MAX_RESPONSE_BODY_LENGTH).toBe(1024);
  });
});

describe('truncateWebhookResponseBody', () => {
  it('returns the original body when under the limit', () => {
    const result = truncateWebhookResponseBody('ok');
    expect(result).toEqual({ body: 'ok', truncated: false });
  });

  it('truncates oversized response bodies', () => {
    const body = 'x'.repeat(2000);
    const result = truncateWebhookResponseBody(body, 100);
    expect(result.truncated).toBe(true);
    expect(result.body.endsWith('...[truncated]')).toBe(true);
    expect(result.body.length).toBeLessThan(body.length);
  });
});

describe('shouldScheduleWebhookRetry', () => {
  it('stops retrying after maxAttempts is reached', () => {
    expect(shouldScheduleWebhookRetry(4, 5)).toBe(true);
    expect(shouldScheduleWebhookRetry(5, 5)).toBe(false);
  });
});

describe('webhook KV contract', () => {
  it('createWebhook writes the config and its index key through the port', async () => {
    const { env, store, put } = createWebhookEnv();

    const id = await createWebhook(env, WEBHOOK_CONFIG_INPUT);

    expect(put).toHaveBeenCalledWith(`webhook:config:${id}`, expect.any(String));
    expect(put).toHaveBeenCalledWith('webhook:index', JSON.stringify([id]));
    expect(store.get('webhook:index')).toEqual([id]);
    const stored = store.get(`webhook:config:${id}`) as WebhookConfig;
    expect(stored.url).toBe(WEBHOOK_CONFIG_INPUT.url);
  });

  it('getWebhook reads the config back through the port', async () => {
    const { env } = createWebhookEnv();
    const id = await createWebhook(env, WEBHOOK_CONFIG_INPUT);

    const webhook = await getWebhook(env, id);

    expect(webhook?.url).toBe(WEBHOOK_CONFIG_INPUT.url);
    expect(webhook?.active).toBe(true);
  });

  it('deleteWebhook deletes the config key and rewrites the index', async () => {
    const { env, store, remove } = createWebhookEnv();
    const id = await createWebhook(env, WEBHOOK_CONFIG_INPUT);

    await deleteWebhook(env, id);

    expect(remove).toHaveBeenCalledWith(`webhook:config:${id}`);
    expect(store.get('webhook:index')).toEqual([]);
  });

  it('createWebhookEvent writes the event and appends it to the event index', async () => {
    const { env, store } = createWebhookEnv();
    const webhookId = await createWebhook(env, WEBHOOK_CONFIG_INPUT);

    const eventId = await createWebhookEvent(env, webhookId, 'batch.completed', 'batch_1', { ok: true });

    expect(store.get(`webhook:event:${eventId}`)).toMatchObject({ id: eventId, webhookId });
    expect(store.get('webhook:event:index')).toEqual([eventId]);
    await expect(getWebhookEvents(env)).resolves.toHaveLength(1);
  });

  it('cleanupWebhookData deletes only events older than the max age', async () => {
    const { env, store, remove } = createWebhookEnv();
    const base: Omit<WebhookEvent, 'id' | 'createdAt' | 'status'> = {
      webhookId: 'webhook_1',
      eventType: 'batch.completed',
      batchId: 'batch_1',
      payload: {},
      attempts: 0,
      maxAttempts: WEBHOOK_CONFIG.MAX_RETRY_ATTEMPTS
    };
    const oldEvent: WebhookEvent = {
      ...base,
      id: 'event_old',
      status: 'delivered',
      createdAt: Date.now() - WEBHOOK_CONFIG.MAX_EVENT_AGE - 1000
    };
    const freshEvent: WebhookEvent = { ...base, id: 'event_new', status: 'delivered', createdAt: Date.now() };
    store.set('webhook:event:index', ['event_old', 'event_new']);
    store.set('webhook:event:event_old', oldEvent);
    store.set('webhook:event:event_new', freshEvent);

    await cleanupWebhookData(env);

    expect(remove).toHaveBeenCalledWith('webhook:event:event_old');
    expect(remove).not.toHaveBeenCalledWith('webhook:event:event_new');
    expect(store.get('webhook:event:index')).toEqual(['event_new']);
  });
});
