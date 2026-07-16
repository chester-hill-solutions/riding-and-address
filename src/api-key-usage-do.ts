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
    const period =
      url.searchParams.get('month') ||
      url.searchParams.get('day') ||
      utcDay(Date.now());
    const prefix = url.searchParams.has('month') ? 'month' : 'count';
    const limit = parseInt(url.searchParams.get('limit') || '0', 10);
    const storageKey = `${prefix}:${period}`;

    if (url.pathname === '/peek') {
      const count = (await this.state.storage.get<number>(storageKey)) || 0;
      return json({
        day: period,
        month: period,
        count,
        limit,
        allowed: limit <= 0 || count < limit,
      });
    }

    // Read-modify-write is safe here: a DO serialises its own requests, which is the entire
    // reason the counter lives in one.
    const current = (await this.state.storage.get<number>(storageKey)) || 0;

    if (limit > 0 && current >= limit) {
      // Fail closed, and do not increment: a blocked request should not inflate the number the
      // operator sees, nor keep pushing the counter up during an attack.
      return json({ day: period, month: period, count: current, limit, allowed: false });
    }

    const next = current + 1;
    await this.state.storage.put(storageKey, next);
    if (prefix === 'count') {
      await this.pruneOldDays(period);
    } else {
      await this.pruneOldMonths(period);
    }

    return json({ day: period, month: period, count: next, limit, allowed: true });
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

  private async pruneOldMonths(currentMonth: string): Promise<void> {
    if (Math.random() > 0.01) return;
    try {
      const entries = await this.state.storage.list<number>({ prefix: 'month:' });
      for (const key of entries.keys()) {
        const month = key.slice('month:'.length);
        if (month < currentMonth.slice(0, 7) && month < monthBefore(currentMonth, 3)) {
          await this.state.storage.delete(key);
        }
      }
    } catch (error) {
      console.warn('[ApiKeyUsageDO] month prune failed:', error);
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
  month?: string;
}

/** UTC calendar month `YYYY-MM`. */
export function utcMonth(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 7);
}

function monthBefore(month: string, months: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - months, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Monthly Customer fuse ledger.
 *
 * Fail-CLOSED when a hard fuse is enforced (`monthlyLimit > 0`) and the DO is
 * missing or errors — otherwise free-tier abuse is unbounded during outages.
 * When `monthlyLimit <= 0` (unlimited / soft-warn counting path), fail-open so
 * availability is not tied to the counter (Stripe sync remains eventual per ADR 0002).
 */
function monthlyFailClosed(
  monthlyLimit: number,
  month: string
): UsageResult {
  return { allowed: false, count: 0, limit: monthlyLimit, day: month, month };
}

function monthlyFailOpen(monthlyLimit: number, month: string): UsageResult {
  return { allowed: true, count: 0, limit: monthlyLimit, day: month, month };
}

export async function consumeMonthlyQuota(
  env: Env,
  customerId: string,
  monthlyLimit: number,
  nowMs: number = Date.now()
): Promise<UsageResult> {
  const month = utcMonth(nowMs);
  if (!env.API_KEY_USAGE) {
    return monthlyLimit > 0 ? monthlyFailClosed(monthlyLimit, month) : monthlyFailOpen(monthlyLimit, month);
  }

  try {
    const id = env.API_KEY_USAGE.idFromName(`customer:${customerId}`);
    const stub = env.API_KEY_USAGE.get(id);
    const response = await stub.fetch(
      `https://usage/consume?month=${month}&limit=${monthlyLimit}`,
      { method: 'POST' }
    );
    const result = (await response.json()) as UsageResult;
    return { ...result, month: result.month || month };
  } catch (error) {
    console.warn(`[ApiKeyUsage] monthly counter unavailable for ${customerId}:`, error);
    return monthlyLimit > 0 ? monthlyFailClosed(monthlyLimit, month) : monthlyFailOpen(monthlyLimit, month);
  }
}

export async function peekMonthlyQuota(
  env: Env,
  customerId: string,
  monthlyLimit: number,
  nowMs: number = Date.now()
): Promise<UsageResult> {
  const month = utcMonth(nowMs);
  if (!env.API_KEY_USAGE) {
    return monthlyLimit > 0 ? monthlyFailClosed(monthlyLimit, month) : monthlyFailOpen(monthlyLimit, month);
  }

  try {
    const id = env.API_KEY_USAGE.idFromName(`customer:${customerId}`);
    const stub = env.API_KEY_USAGE.get(id);
    const response = await stub.fetch(`https://usage/peek?month=${month}&limit=${monthlyLimit}`);
    const result = (await response.json()) as UsageResult;
    return { ...result, month: result.month || month };
  } catch {
    return monthlyLimit > 0 ? monthlyFailClosed(monthlyLimit, month) : monthlyFailOpen(monthlyLimit, month);
  }
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
