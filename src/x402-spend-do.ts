/**
 * Per-payer spend counter for the account-free rail (security review item 4).
 *
 * The offer ceiling bounds each offer; nothing bounded the *total* a payer could spend. A runaway
 * agent — a retry loop, a mis-set budget, an agent left running — could accept offers indefinitely.
 * This counts spend per payer per UTC day and refuses past the cap.
 *
 * A Durable Object, not KV: the check is a read-modify-write, and KV is eventually consistent with
 * roughly one write per second per key, so a KV counter would both undercount and throttle. One
 * instance per payer keeps payers independent.
 *
 * Amounts are micro-USD integers. The point-lookup price is half a cent, so counting in cents would
 * round it to zero.
 *
 * **Fail-closed by design, unlike the per-key quota DO.** That counter guards cost and fails open; an
 * unavailable counter there degrades billing accuracy. This one guards the payer's money, so an
 * unavailable counter refuses the sale rather than spending blind.
 */

import { utcDay } from './time';
import type { Env } from './types';

const MICRO_USD = 1_000_000;

export class X402SpendDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const day = url.searchParams.get('day') || utcDay(Date.now());
    const amount = Math.max(0, parseInt(url.searchParams.get('amount') || '0', 10) || 0);
    const key = `spend:${day}`;

    // A transaction, not a bare read-then-write: reserve must be atomic or two concurrent accepts
    // by the same payer could both pass the check.
    if (url.pathname === '/reserve' && request.method === 'POST') {
      const cap = Math.max(0, parseInt(url.searchParams.get('cap') || '0', 10) || 0);
      const result = await this.state.storage.transaction(async (txn) => {
        const spent = (await txn.get<number>(key)) || 0;
        if (cap > 0 && spent + amount > cap) {
          // Refuse without incrementing: a blocked request must not inflate the counter.
          return { allowed: false, spent, cap, day };
        }
        const next = spent + amount;
        await txn.put(key, next);
        return { allowed: true, spent: next, cap, day };
      });
      if (result.allowed) await this.pruneOldDays(day);
      return json(result);
    }

    if (url.pathname === '/release' && request.method === 'POST') {
      const spent = await this.state.storage.transaction(async (txn) => {
        const current = (await txn.get<number>(key)) || 0;
        const next = Math.max(0, current - amount);
        await txn.put(key, next);
        return next;
      });
      return json({ allowed: true, spent, cap: 0, day });
    }

    return new Response('Not found', { status: 404 });
  }

  /** Keep a short window; without this the object accretes a row per day forever. */
  private async pruneOldDays(currentDay: string): Promise<void> {
    // Cheap guard: sweep occasionally rather than on every reserve.
    if (Math.random() > 0.01) return;
    try {
      const entries = await this.state.storage.list<number>({ prefix: 'spend:' });
      const cutoff = utcDay(Date.parse(`${currentDay}T00:00:00Z`) - 7 * 86_400_000);
      for (const key of entries.keys()) {
        if (key.slice('spend:'.length) < cutoff) await this.state.storage.delete(key);
      }
    } catch (error) {
      console.warn('[X402SpendDO] prune failed:', error);
    }
  }
}

/** Micro-USD, the unit the counter stores. Exported so the client and the DO cannot disagree. */
export function toMicroUsd(usd: number): number {
  return Math.round(usd * MICRO_USD);
}

export function fromMicroUsd(micro: number): number {
  return micro / MICRO_USD;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=UTF-8' },
  });
}
