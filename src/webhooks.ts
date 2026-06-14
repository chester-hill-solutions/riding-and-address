import { Env, WebhookConfig, WebhookEvent, WebhookDelivery } from './types';
import { TIME_CONSTANTS } from './config';

// Webhook configuration
export const WEBHOOK_CONFIG = {
  ENABLED: true,
  MAX_RETRY_ATTEMPTS: 5,
  RETRY_DELAY: 5000, // 5 seconds
  TIMEOUT: 30000, // 30 seconds
  MAX_WEBHOOKS: 10,
  CLEANUP_INTERVAL: TIME_CONSTANTS.TWENTY_FOUR_HOURS_MS,
  MAX_EVENT_AGE: TIME_CONSTANTS.SEVEN_DAYS_MS
};

// KV storage key prefixes
const WEBHOOK_CONFIG_PREFIX = 'webhook:config:';
const WEBHOOK_EVENT_PREFIX = 'webhook:event:';
const WEBHOOK_DELIVERY_PREFIX = 'webhook:delivery:';
const WEBHOOK_INDEX_KEY = 'webhook:index';
const WEBHOOK_EVENT_INDEX_KEY = 'webhook:event:index';
const WEBHOOK_DELIVERY_INDEX_KEY = 'webhook:delivery:index';

// Track if webhook processing has been initialized
let webhookProcessingInitialized = false;

// ID generation functions
export function generateWebhookId(): string {
  return `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateEventId(): string {
  return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateDeliveryId(): string {
  return `delivery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Helper functions for KV storage
async function getWebhookConfig(env: Env, webhookId: string): Promise<WebhookConfig | null> {
  if (!env.WEBHOOKS) {
    return null;
  }
  const data = await env.WEBHOOKS.get(`${WEBHOOK_CONFIG_PREFIX}${webhookId}`, 'json');
  return data as WebhookConfig | null;
}

async function setWebhookConfig(env: Env, webhookId: string, config: WebhookConfig): Promise<void> {
  if (!env.WEBHOOKS) return;
  await env.WEBHOOKS.put(`${WEBHOOK_CONFIG_PREFIX}${webhookId}`, JSON.stringify(config));
  // Update index
  const index = await getWebhookIndex(env);
  if (!index.includes(webhookId)) {
    index.push(webhookId);
    await env.WEBHOOKS.put(WEBHOOK_INDEX_KEY, JSON.stringify(index));
  }
}

async function deleteWebhookConfig(env: Env, webhookId: string): Promise<void> {
  if (!env.WEBHOOKS) return;
  await env.WEBHOOKS.delete(`${WEBHOOK_CONFIG_PREFIX}${webhookId}`);
  // Update index
  const index = await getWebhookIndex(env);
  const newIndex = index.filter(id => id !== webhookId);
  await env.WEBHOOKS.put(WEBHOOK_INDEX_KEY, JSON.stringify(newIndex));
}

async function getWebhookIndex(env: Env): Promise<string[]> {
  if (!env.WEBHOOKS) return [];
  const data = await env.WEBHOOKS.get(WEBHOOK_INDEX_KEY, 'json');
  return (data as string[]) || [];
}

async function getEventIndex(env: Env): Promise<string[]> {
  if (!env.WEBHOOKS) return [];
  const data = await env.WEBHOOKS.get(WEBHOOK_EVENT_INDEX_KEY, 'json');
  return (data as string[]) || [];
}

async function addEventToIndex(env: Env, eventId: string): Promise<void> {
  if (!env.WEBHOOKS) return;
  const index = await getEventIndex(env);
  if (!index.includes(eventId)) {
    index.push(eventId);
    await env.WEBHOOKS.put(WEBHOOK_EVENT_INDEX_KEY, JSON.stringify(index));
  }
}

async function getDeliveryIndex(env: Env): Promise<string[]> {
  if (!env.WEBHOOKS) return [];
  const data = await env.WEBHOOKS.get(WEBHOOK_DELIVERY_INDEX_KEY, 'json');
  return (data as string[]) || [];
}

async function addDeliveryToIndex(env: Env, deliveryId: string): Promise<void> {
  if (!env.WEBHOOKS) return;
  const index = await getDeliveryIndex(env);
  if (!index.includes(deliveryId)) {
    index.push(deliveryId);
    await env.WEBHOOKS.put(WEBHOOK_DELIVERY_INDEX_KEY, JSON.stringify(index));
  }
}

// Create webhook event
export async function createWebhookEvent(env: Env, webhookId: string, eventType: string, batchId: string, payload: Record<string, unknown>): Promise<string> {
  const eventId = generateEventId();
  const event: WebhookEvent = {
    id: eventId,
    webhookId,
    eventType,
    batchId,
    status: 'pending',
    payload,
    createdAt: Date.now(),
    attempts: 0,
    maxAttempts: WEBHOOK_CONFIG.MAX_RETRY_ATTEMPTS,
    lastAttempt: undefined,
    nextRetry: undefined
  };
  
  if (env.WEBHOOKS) {
    await env.WEBHOOKS.put(`${WEBHOOK_EVENT_PREFIX}${eventId}`, JSON.stringify(event));
    await addEventToIndex(env, eventId);
  }
  
  return eventId;
}

// Create webhook signature using proper HMAC-SHA256
export async function createWebhookSignature(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = encoder.encode(secret);
  const data = encoder.encode(payload);
  
  // Import the key for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Perform HMAC-SHA256
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `sha256=${hashHex}`;
}

// Deliver webhook
export async function deliverWebhook(env: Env, webhookId: string, eventId: string): Promise<boolean> {
  const webhook = await getWebhookConfig(env, webhookId);
  if (!env.WEBHOOKS) return false;
  const eventData = await env.WEBHOOKS.get(`${WEBHOOK_EVENT_PREFIX}${eventId}`, 'json');
  const event = eventData as WebhookEvent | null;
  
  if (!webhook || !event || !webhook.active) {
    return false;
  }
  
  const deliveryId = generateDeliveryId();
  const startTime = Date.now();
  const delivery: WebhookDelivery = {
    id: deliveryId,
    webhookId,
    eventId,
    status: 'success',
    responseCode: undefined,
    responseBody: undefined,
    attemptedAt: startTime,
    duration: 0,
    error: undefined
  };
  
  try {
    // Create signature
    const signature = await createWebhookSignature(webhook.secret, JSON.stringify(event.payload));
    
    // Make the webhook request
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'riding-lookup-webhook/1.0',
        'X-Webhook-Event': event.eventType,
        'X-Webhook-Signature': signature,
        'X-Webhook-Delivery': deliveryId
      },
      body: JSON.stringify(event.payload),
      signal: AbortSignal.timeout(WEBHOOK_CONFIG.TIMEOUT)
    });
    
    const endTime = Date.now();
    delivery.duration = endTime - startTime;
    delivery.responseCode = response.status;
    delivery.responseBody = await response.text();
    
    if (response.ok) {
      delivery.status = 'success';
      event.status = 'delivered';
      event.attempts++;
      event.lastAttempt = endTime;
      if (env.WEBHOOKS) {
        await env.WEBHOOKS.put(`${WEBHOOK_EVENT_PREFIX}${eventId}`, JSON.stringify(event));
        await env.WEBHOOKS.put(`${WEBHOOK_DELIVERY_PREFIX}${deliveryId}`, JSON.stringify(delivery));
        await addDeliveryToIndex(env, deliveryId);
      }
      return true;
    } else {
      delivery.status = 'failed';
      delivery.error = `HTTP ${response.status}: ${delivery.responseBody}`;
      if (env.WEBHOOKS) {
        await env.WEBHOOKS.put(`${WEBHOOK_DELIVERY_PREFIX}${deliveryId}`, JSON.stringify(delivery));
        await addDeliveryToIndex(env, deliveryId);
      }
      
      // Schedule retry if within limits
      if (event.attempts < event.maxAttempts) {
        event.status = 'pending';
        event.attempts++;
        event.nextRetry = Date.now() + WEBHOOK_CONFIG.RETRY_DELAY * Math.pow(2, event.attempts - 1);
        event.lastAttempt = endTime;
        if (env.WEBHOOKS) {
          await env.WEBHOOKS.put(`${WEBHOOK_EVENT_PREFIX}${eventId}`, JSON.stringify(event));
        }
      } else {
        event.status = 'failed';
        event.lastAttempt = endTime;
        if (env.WEBHOOKS) {
          await env.WEBHOOKS.put(`${WEBHOOK_EVENT_PREFIX}${eventId}`, JSON.stringify(event));
        }
      }
      
      return false;
    }
  } catch (error) {
    const endTime = Date.now();
    delivery.duration = endTime - startTime;
    delivery.status = 'failed';
    delivery.error = error instanceof Error ? error.message : 'Unknown error';
    if (env.WEBHOOKS) {
      await env.WEBHOOKS.put(`${WEBHOOK_DELIVERY_PREFIX}${deliveryId}`, JSON.stringify(delivery));
      await addDeliveryToIndex(env, deliveryId);
    }
    
    // Schedule retry if within limits
    if (event.attempts < event.maxAttempts) {
      event.status = 'pending';
      event.attempts++;
      event.nextRetry = Date.now() + WEBHOOK_CONFIG.RETRY_DELAY * Math.pow(2, event.attempts - 1);
      event.lastAttempt = endTime;
      if (env.WEBHOOKS) {
        await env.WEBHOOKS.put(`${WEBHOOK_EVENT_PREFIX}${eventId}`, JSON.stringify(event));
      }
    } else {
      event.status = 'failed';
      event.lastAttempt = endTime;
      if (env.WEBHOOKS) {
        await env.WEBHOOKS.put(`${WEBHOOK_EVENT_PREFIX}${eventId}`, JSON.stringify(event));
      }
    }
    
    return false;
  }
}

// Process webhook events
export async function processWebhookEvents(env: Env): Promise<void> {
  if (!WEBHOOK_CONFIG.ENABLED || !env.WEBHOOKS) {
    return;
  }
  
  const now = Date.now();
  const eventsToProcess: WebhookEvent[] = [];
  
  // Find events that need processing
  const eventIndex = await getEventIndex(env);
  for (const eventId of eventIndex) {
    const eventData = await env.WEBHOOKS.get(`${WEBHOOK_EVENT_PREFIX}${eventId}`, 'json');
    if (eventData) {
      const event = eventData as WebhookEvent;
      if (event.status === 'pending' && (!event.nextRetry || now >= event.nextRetry)) {
        eventsToProcess.push(event);
      }
    }
  }
  
  // Process events
  for (const event of eventsToProcess) {
    try {
      await deliverWebhook(env, event.webhookId, event.id);
    } catch (error) {
      console.error(`Failed to process webhook event ${event.id}:`, error);
    }
  }
}

// Cleanup old webhook data
export async function cleanupWebhookData(env: Env): Promise<void> {
  if (!env.WEBHOOKS) return;
  
  const now = Date.now();
  const maxAge = WEBHOOK_CONFIG.MAX_EVENT_AGE;
  
  // Clean up old events
  const eventIndex = await getEventIndex(env);
  const eventsToDelete: string[] = [];
  for (const eventId of eventIndex) {
    const eventData = await env.WEBHOOKS.get(`${WEBHOOK_EVENT_PREFIX}${eventId}`, 'json');
    if (eventData) {
      const event = eventData as WebhookEvent;
      if (now - event.createdAt > maxAge) {
        await env.WEBHOOKS.delete(`${WEBHOOK_EVENT_PREFIX}${eventId}`);
        eventsToDelete.push(eventId);
      }
    }
  }
  // Update index
  const newEventIndex = eventIndex.filter(id => !eventsToDelete.includes(id));
  await env.WEBHOOKS.put(WEBHOOK_EVENT_INDEX_KEY, JSON.stringify(newEventIndex));
  
  // Clean up old deliveries
  const deliveryIndex = await getDeliveryIndex(env);
  const deliveriesToDelete: string[] = [];
  for (const deliveryId of deliveryIndex) {
    const deliveryData = await env.WEBHOOKS.get(`${WEBHOOK_DELIVERY_PREFIX}${deliveryId}`, 'json');
    if (deliveryData) {
      const delivery = deliveryData as WebhookDelivery;
      if (now - delivery.attemptedAt > maxAge) {
        await env.WEBHOOKS.delete(`${WEBHOOK_DELIVERY_PREFIX}${deliveryId}`);
        deliveriesToDelete.push(deliveryId);
      }
    }
  }
  // Update index
  const newDeliveryIndex = deliveryIndex.filter(id => !deliveriesToDelete.includes(id));
  await env.WEBHOOKS.put(WEBHOOK_DELIVERY_INDEX_KEY, JSON.stringify(newDeliveryIndex));
}

// Initialize webhook processing
export function initializeWebhookProcessing(_env: Env): void {
  // Guard: only initialize once
  if (webhookProcessingInitialized) {
    return;
  }
  
  if (!WEBHOOK_CONFIG.ENABLED) {
    return;
  }
  
  // Mark as initialized
  webhookProcessingInitialized = true;
  
  // Note: Webhook processing and cleanup are now handled via Cron Triggers
  // in the scheduled handler rather than setInterval, which is more reliable
  // in Cloudflare Workers and avoids keeping isolates alive.
}

// Trigger webhook for batch completion
export async function triggerBatchCompletionWebhook(env: Env, batchId: string, batchStatus: Record<string, unknown>): Promise<void> {
  if (!WEBHOOK_CONFIG.ENABLED) {
    return;
  }
  
  const payload = {
    event: 'batch.completed',
    batchId,
    timestamp: Date.now(),
    status: batchStatus.status,
    results: batchStatus.results,
    errors: batchStatus.errors,
    processingTime: (batchStatus.completedAt as number) - (batchStatus.createdAt as number)
  };
  
  // Create events for all enabled webhooks
  const webhookIndex = await getWebhookIndex(env);
  for (const webhookId of webhookIndex) {
    const webhook = await getWebhookConfig(env, webhookId);
    if (webhook && webhook.active && webhook.events.includes('batch.completed')) {
      try {
        await createWebhookEvent(env, webhookId, 'batch.completed', batchId, payload);
      } catch (error) {
        console.error(`Failed to create webhook event for ${webhookId}:`, error);
      }
    }
  }
}

// Webhook management functions
export async function createWebhook(env: Env, config: Omit<WebhookConfig, 'createdAt' | 'lastDelivery' | 'failureCount' | 'maxFailures'>): Promise<string> {
  const webhookIndex = await getWebhookIndex(env);
  if (webhookIndex.length >= WEBHOOK_CONFIG.MAX_WEBHOOKS) {
    throw new Error('Maximum number of webhooks reached');
  }
  
  const webhookId = generateWebhookId();
  const webhook: WebhookConfig = {
    ...config,
    createdAt: Date.now(),
    lastDelivery: undefined,
    failureCount: 0,
    maxFailures: 5
  };
  
  await setWebhookConfig(env, webhookId, webhook);
  return webhookId;
}

export async function updateWebhook(env: Env, webhookId: string, updates: Partial<WebhookConfig>): Promise<boolean> {
  const webhook = await getWebhookConfig(env, webhookId);
  if (!webhook) {
    return false;
  }
  
  const updatedWebhook = { ...webhook, ...updates };
  await setWebhookConfig(env, webhookId, updatedWebhook);
  return true;
}

export async function deleteWebhook(env: Env, webhookId: string): Promise<boolean> {
  const webhook = await getWebhookConfig(env, webhookId);
  if (!webhook) {
    return false;
  }
  await deleteWebhookConfig(env, webhookId);
  return true;
}

export async function getWebhook(env: Env, webhookId: string): Promise<WebhookConfig | null> {
  return await getWebhookConfig(env, webhookId);
}

export async function getAllWebhooks(env: Env): Promise<Map<string, WebhookConfig>> {
  const webhookIndex = await getWebhookIndex(env);
  const webhooks = new Map<string, WebhookConfig>();
  for (const webhookId of webhookIndex) {
    const webhook = await getWebhookConfig(env, webhookId);
    if (webhook) {
      webhooks.set(webhookId, webhook);
    }
  }
  return webhooks;
}

export async function getWebhookEvents(env: Env, webhookId?: string): Promise<WebhookEvent[]> {
  if (!env.WEBHOOKS) return [];
  const eventIndex = await getEventIndex(env);
  const events: WebhookEvent[] = [];
  for (const eventId of eventIndex) {
    const eventData = await env.WEBHOOKS.get(`${WEBHOOK_EVENT_PREFIX}${eventId}`, 'json');
    if (eventData) {
      const event = eventData as WebhookEvent;
      if (!webhookId || event.webhookId === webhookId) {
        events.push(event);
      }
    }
  }
  return events;
}

export async function getWebhookDeliveries(env: Env, webhookId?: string): Promise<WebhookDelivery[]> {
  if (!env.WEBHOOKS) return [];
  const deliveryIndex = await getDeliveryIndex(env);
  const deliveries: WebhookDelivery[] = [];
  for (const deliveryId of deliveryIndex) {
    const deliveryData = await env.WEBHOOKS.get(`${WEBHOOK_DELIVERY_PREFIX}${deliveryId}`, 'json');
    if (deliveryData) {
      const delivery = deliveryData as WebhookDelivery;
      if (!webhookId || delivery.webhookId === webhookId) {
        deliveries.push(delivery);
      }
    }
  }
  return deliveries;
}
