import { Env } from './types';
import { utcDay } from './time';
import { UploadJobs } from './upload-jobs';

// `utcDay`/`utcMonth` live in `src/time.ts`; import them from there.

/**
 * Per-entity daily counters — the fuse behind the browser API keys, and the x402 spend cap.
 *
 * Canada Post gives you a daily spend limit; Google just makes you "financially responsible for
 * charges caused by abuse of unrestricted API keys". Since a public key leaking is a when, not an
 * if, the cap is what turns an unbounded liability into a bounded one.
 *
 * A Durable Object rather than KV: KV is eventually consistent and rate-limits writes to roughly
 * one per second per key, so a KV counter under real traffic would both undercount and throttle.
 * A DO gives serialized, correct increments, and one instance per entity keeps them independent.
 *
 * Two callers share this class because the shape is identical — a per-entity daily counter — even
 * though the units are not: the key quota counts requests, the x402 cap counts micro-USD. The
 * *failure direction* differs by caller, not here: the key quota fails open (a counter outage should
 * degrade billing accuracy, not break search), the spend cap fails closed (an outage must not mean
 * spending blind). That lives in the two client functions, deliberately.
 */
export class ApiKeyUsageDO {
  private state: DurableObjectState;
  private uploads: UploadJobs;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
    this.uploads = new UploadJobs(state, _env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/claim-free' && request.method === 'POST') {
      const { customerId } = await request.json() as { customerId: string };
      if (!customerId) return new Response('Missing customer', { status: 400 });
      return this.state.storage.transaction(async txn => {
        const owner = await txn.get<string>('free:owner');
        if (!owner) await txn.put('free:owner', customerId);
        return json({ allowed: !owner || owner === customerId });
      });
    }
    if (url.pathname.startsWith('/uploads/')) return this.uploads.handle(request);

    // The x402 per-payer spend cap. Amounts are micro-USD: the point price is half a cent, so
    // counting in cents would round it to zero. A transaction, not a bare read-then-write, so two
    // concurrent accepts by one payer cannot both pass the check.
    if (url.pathname.startsWith('/spend/') && request.method === 'POST') {
      const day = url.searchParams.get('day') || utcDay(Date.now());
      const amount = Math.max(0, parseInt(url.searchParams.get('amount') || '0', 10) || 0);
      const spendKey = `spend:${day}`;

      if (url.pathname === '/spend/reserve') {
        const cap = Math.max(0, parseInt(url.searchParams.get('cap') || '0', 10) || 0);
        const result = await this.state.storage.transaction(async txn => {
          const spent = (await txn.get<number>(spendKey)) || 0;
          if (cap > 0 && spent + amount > cap) {
            // Refuse without incrementing: a blocked request must not inflate the counter.
            return { allowed: false, spent, cap, day };
          }
          const next = spent + amount;
          await txn.put(spendKey, next);
          return { allowed: true, spent: next, cap, day };
        });
        if (result.allowed) await this.pruneOldSpend(day);
        return json(result);
      }

      if (url.pathname === '/spend/release') {
        const spent = await this.state.storage.transaction(async txn => {
          const current = (await txn.get<number>(spendKey)) || 0;
          const next = Math.max(0, current - amount);
          await txn.put(spendKey, next);
          return next;
        });
        return json({ allowed: true, spent, cap: 0, day });
      }

      return new Response('Not found', { status: 404 });
    }

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

  async alarm(): Promise<void> { await this.uploads.alarm(); }

  /** Keep a short window for spend; without this the object accretes a row per payer-day forever. */
  private async pruneOldSpend(currentDay: string): Promise<void> {
    if (Math.random() > 0.01) return;
    try {
      const entries = await this.state.storage.list<number>({ prefix: 'spend:' });
      const cutoff = utcDay(Date.parse(`${currentDay}T00:00:00Z`) - 7 * 86_400_000);
      for (const key of entries.keys()) {
        if (key.slice('spend:'.length) < cutoff) await this.state.storage.delete(key);
      }
    } catch (error) {
      console.warn('[ApiKeyUsageDO] spend prune failed:', error);
    }
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

function monthBefore(month: string, months: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - months, 1));
  return d.toISOString().slice(0, 7);
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
