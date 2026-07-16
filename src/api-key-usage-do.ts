import { Env } from './types';

/**
 * Per-key daily request counter — the fuse behind the browser API keys.
 *
 * Canada Post gives you a daily spend limit; Google just makes you "financially responsible for
 * charges caused by abuse of unrestricted API keys". Since a public key leaking is a when, not an
 * if, the cap is what turns an unbounded liability into a bounded one.
 *
 * A Durable Object rather than KV: KV is eventually consistent and rate-limits writes to roughly
 * one per second per key, so a KV counter under real traffic would both undercount and throttle.
 * A DO gives serialized, correct increments, and one instance per key keeps them independent.
 */
export class ApiKeyUsageDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const day = url.searchParams.get('day') || utcDay(Date.now());
    const limit = parseInt(url.searchParams.get('limit') || '0', 10);

    if (url.pathname === '/peek') {
      const count = (await this.state.storage.get<number>(`count:${day}`)) || 0;
      return json({ day, count, limit, allowed: limit <= 0 || count < limit });
    }

    // Read-modify-write is safe here: a DO serialises its own requests, which is the entire
    // reason the counter lives in one.
    const current = (await this.state.storage.get<number>(`count:${day}`)) || 0;

    if (limit > 0 && current >= limit) {
      // Fail closed, and do not increment: a blocked request should not inflate the number the
      // operator sees, nor keep pushing the counter up during an attack.
      return json({ day, count: current, limit, allowed: false });
    }

    const next = current + 1;
    await this.state.storage.put(`count:${day}`, next);
    await this.pruneOldDays(day);

    return json({ day, count: next, limit, allowed: true });
  }

  /** Keep only a short window; without this every key accretes a row per day forever. */
  private async pruneOldDays(currentDay: string): Promise<void> {
    // Cheap guard: only sweep occasionally rather than on every request.
    if (Math.random() > 0.01) return;
    try {
      const entries = await this.state.storage.list<number>({ prefix: 'count:' });
      const cutoff = dayBefore(currentDay, 7);
      for (const key of entries.keys()) {
        if (key.slice('count:'.length) < cutoff) {
          await this.state.storage.delete(key);
        }
      }
    } catch (error) {
      console.warn('[ApiKeyUsageDO] prune failed:', error);
    }
  }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=UTF-8' },
  });
}

/** UTC so the reset boundary does not move with the caller's timezone. */
export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function dayBefore(day: string, days: number): string {
  const ms = Date.parse(`${day}T00:00:00Z`) - days * 86400_000;
  return utcDay(ms);
}

export interface UsageResult {
  allowed: boolean;
  count: number;
  limit: number;
  day: string;
}

/**
 * Count one request against a key's daily cap.
 *
 * Fails OPEN when the DO is unavailable: the cap protects against cost, and a counter outage
 * should degrade billing accuracy, not take the whole search endpoint down. The origin allowlist
 * is still enforced regardless.
 */
export async function consumeDailyQuota(
  env: Env,
  keyId: string,
  dailyLimit: number,
  nowMs: number = Date.now()
): Promise<UsageResult> {
  const day = utcDay(nowMs);
  if (!env.API_KEY_USAGE || dailyLimit <= 0) {
    return { allowed: true, count: 0, limit: dailyLimit, day };
  }

  try {
    const id = env.API_KEY_USAGE.idFromName(keyId);
    const stub = env.API_KEY_USAGE.get(id);
    const response = await stub.fetch(
      `https://usage/consume?day=${day}&limit=${dailyLimit}`,
      { method: 'POST' }
    );
    return (await response.json()) as UsageResult;
  } catch (error) {
    console.warn(`[ApiKeyUsage] counter unavailable for ${keyId}:`, error);
    return { allowed: true, count: 0, limit: dailyLimit, day };
  }
}

export async function peekDailyQuota(
  env: Env,
  keyId: string,
  dailyLimit: number,
  nowMs: number = Date.now()
): Promise<UsageResult> {
  const day = utcDay(nowMs);
  if (!env.API_KEY_USAGE) return { allowed: true, count: 0, limit: dailyLimit, day };

  try {
    const id = env.API_KEY_USAGE.idFromName(keyId);
    const stub = env.API_KEY_USAGE.get(id);
    const response = await stub.fetch(`https://usage/peek?day=${day}&limit=${dailyLimit}`);
    return (await response.json()) as UsageResult;
  } catch {
    return { allowed: true, count: 0, limit: dailyLimit, day };
  }
}
