import { Env } from './types';

export type UsageLedgerResult = {
  allowed: boolean;
  count: number;
  limit: number;
  month: string;
  /** Present on daily-counter results; monthly results reuse the month id. */
  day?: string;
};

/**
 * Customer monthly fuse counter.
 *
 * Implementations own their unavailability policy:
 * - the Durable Object adapter fails CLOSED on a hard fuse (limit > 0) so
 *   free-tier abuse is unbounded during outages, and fails OPEN when the
 *   limit is 0 / soft-warn so availability never depends on the counter
 *   (Stripe sync stays eventual per ADR-0002);
 * - the in-memory fake is a test double implementing intent, not wire format.
 */
export interface UsageLedger {
  consumeMonthly(customerId: string, monthlyLimit: number, nowMs: number): Promise<UsageLedgerResult>;
  peekMonthly(customerId: string, monthlyLimit: number, nowMs: number): Promise<UsageLedgerResult>;
}

export function utcMonth(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 7);
}

function failClosed(monthlyLimit: number, month: string): UsageLedgerResult {
  return { allowed: false, count: 0, limit: monthlyLimit, month };
}

function failOpen(monthlyLimit: number, month: string): UsageLedgerResult {
  return { allowed: true, count: 0, limit: monthlyLimit, month };
}

/** Production adapter: the ApiKeyUsage Durable Object behind env.API_KEY_USAGE. */
export class DurableUsageLedger implements UsageLedger {
  constructor(private env: Env) {}

  async consumeMonthly(customerId: string, monthlyLimit: number, nowMs: number = Date.now()): Promise<UsageLedgerResult> {
    const month = utcMonth(nowMs);
    if (!this.env.API_KEY_USAGE) {
      return monthlyLimit > 0 ? failClosed(monthlyLimit, month) : failOpen(monthlyLimit, month);
    }

    try {
      const id = this.env.API_KEY_USAGE.idFromName(`customer:${customerId}`);
      const stub = this.env.API_KEY_USAGE.get(id);
      const response = await stub.fetch(
        `https://usage/consume?month=${month}&limit=${monthlyLimit}`,
        { method: 'POST' }
      );
      const result = (await response.json()) as UsageLedgerResult;
      return { ...result, month: result.month || month };
    } catch (error) {
      console.warn(`[ApiKeyUsage] monthly counter unavailable for ${customerId}:`, error);
      return monthlyLimit > 0 ? failClosed(monthlyLimit, month) : failOpen(monthlyLimit, month);
    }
  }

  async peekMonthly(customerId: string, monthlyLimit: number, nowMs: number = Date.now()): Promise<UsageLedgerResult> {
    const month = utcMonth(nowMs);
    if (!this.env.API_KEY_USAGE) {
      return monthlyLimit > 0 ? failClosed(monthlyLimit, month) : failOpen(monthlyLimit, month);
    }

    try {
      const id = this.env.API_KEY_USAGE.idFromName(`customer:${customerId}`);
      const stub = this.env.API_KEY_USAGE.get(id);
      const response = await stub.fetch(`https://usage/peek?month=${month}&limit=${monthlyLimit}`);
      const result = (await response.json()) as UsageLedgerResult;
      return { ...result, month: result.month || month };
    } catch {
      return monthlyLimit > 0 ? failClosed(monthlyLimit, month) : failOpen(monthlyLimit, month);
    }
  }
}

export function durableUsageLedger(env: Env): UsageLedger {
  return new DurableUsageLedger(env);
}

/** Test double: deterministic counts with an optional always-deny mode. */
export class InMemoryUsageLedger implements UsageLedger {
  private counts = new Map<string, number>();

  constructor(
    private opts: { denyAll?: boolean; allowedWhenOverLimit?: boolean } = {}
  ) {}

  async consumeMonthly(customerId: string, monthlyLimit: number, nowMs: number = Date.now()): Promise<UsageLedgerResult> {
    const month = utcMonth(nowMs);
    const key = `${customerId}:${month}`;
    const previous = this.counts.get(key) ?? 0;

    if (this.opts.denyAll) {
      return { allowed: false, count: previous, limit: monthlyLimit, month };
    }

    const next = previous + 1;
    if (monthlyLimit > 0 && next > monthlyLimit && !this.opts.allowedWhenOverLimit) {
      return { allowed: false, count: previous, limit: monthlyLimit, month };
    }

    this.counts.set(key, next);
    return { allowed: true, count: next, limit: monthlyLimit, month };
  }

  async peekMonthly(customerId: string, monthlyLimit: number, nowMs: number = Date.now()): Promise<UsageLedgerResult> {
    const month = utcMonth(nowMs);
    const count = this.counts.get(`${customerId}:${month}`) ?? 0;
    return { allowed: true, count, limit: monthlyLimit, month };
  }
}

/** Test double: every call resolves to one canned result. */
export class StaticUsageLedger implements UsageLedger {
  constructor(private result: UsageLedgerResult) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async consumeMonthly(customerId?: string, monthlyLimit?: number, nowMs?: number): Promise<UsageLedgerResult> {
    return this.result;
  }
  async peekMonthly(_customerId?: string, _monthlyLimit?: number): Promise<UsageLedgerResult> {
    return this.result;
  }
}
