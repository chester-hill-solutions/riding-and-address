import { describe, it, expect } from 'vitest';
import {
  generateWebhookId,
  generateEventId,
  generateDeliveryId,
  createWebhookSignature,
  truncateWebhookResponseBody,
  shouldScheduleWebhookRetry,
  WEBHOOK_CONFIG
} from '../src/webhooks';

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
