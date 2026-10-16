/**
 * x402 receipt store and reconciliation (ADR 0007, plan W11).
 *
 * An x402 payment is deliberately **not** written to the Customer Durable Object ledger — a direct
 * payment creates no Customer and is not a Billable unit. That leaves reconciliation without a
 * source of truth, which is this module's whole job: record one receipt per settled payment, and
 * expose enough to answer "what settled, what was delivered, what needs crediting".
 *
 * The rail requires this store: without it a settled payment would leave no trace, so
 * `/api/quote/accept` fails closed when `X402_RECEIPTS` is unbound and the rail is enabled.
 */

import { z } from 'zod';
import { badRequest } from './utils';
import type { RouteContext } from './route-context';
import type { Env } from './types';

/** Receipt keys are prefixed so one namespace can hold them alongside future x402 records. */
const RECEIPT_PREFIX = 'x402receipt:';

/** The KV key a receipt is stored under. Exported so reconciliation can rewrite it in place. */
export function receiptKey(receipt: Pick<X402Receipt, 'recordedAt' | 'offerId'>): string {
  return `${RECEIPT_PREFIX}${receipt.recordedAt}:${receipt.offerId}`;
}

/** Receipts are reconciliation data, not history: 90 days is plenty to settle an incident. */
const RECEIPT_TTL_SECONDS = 90 * 24 * 60 * 60;

export const X402ReceiptSchema = z.object({
  offerId: z.string(),
  operation: z.string(),
  settlement: z.object({
    transaction: z.string().optional(),
    network: z.string(),
  }),
  amount: z.object({ currency: z.string(), value: z.number() }),
  scope: z.object({ datasetId: z.string(), datasetYear: z.number() }),
  resultCount: z.number(),
  /** False means settled but not delivered — the case an operator must credit or retry. */
  delivered: z.boolean(),
  /**
   * Chain-confirmation state, written by the reconciliation job. Absent until it has run, so an
   * unchecked receipt is distinguishable from a checked-but-unknown one.
   */
  confirmation: z.enum(['confirmed', 'failed', 'unknown']).optional(),
  checkedAt: z.string().optional(),
  correlationId: z.string(),
  recordedAt: z.string(),
});

export type X402Receipt = z.infer<typeof X402ReceiptSchema>;

/** True when the receipt store is bound. The rail is unavailable without it. */
export function receiptsBound(env: Env): boolean {
  return Boolean(env.X402_RECEIPTS);
}

/**
 * Record a receipt. Best-effort: a storage failure must not lose a payment that already settled, so
 * it logs rather than throws. The rail requires the binding, so this normally writes.
 */
export async function recordReceipt(env: Env, receipt: X402Receipt): Promise<void> {
  if (!env.X402_RECEIPTS) return;
  try {
    await env.X402_RECEIPTS.put(
      receiptKey(receipt),
      JSON.stringify(receipt),
      { expirationTtl: RECEIPT_TTL_SECONDS }
    );
  } catch (error) {
    console.warn(`[X402] failed to record receipt for offer ${receipt.offerId}:`, error);
  }
}

/** Read the most recent receipts, newest first. Malformed entries are skipped, never trusted. */
export async function listReceipts(env: Env, limit = 100): Promise<X402Receipt[]> {
  if (!env.X402_RECEIPTS) return [];
  const listing = await env.X402_RECEIPTS.list({ prefix: RECEIPT_PREFIX, limit });
  const receipts: X402Receipt[] = [];
  for (const key of listing.keys) {
    const raw = await env.X402_RECEIPTS.get(key.name, 'json');
    const parsed = X402ReceiptSchema.safeParse(raw);
    if (parsed.success) receipts.push(parsed.data);
  }
  return receipts.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export interface ReconciliationSummary {
  total: number;
  delivered: number;
  /** Settled but not delivered: the population an operator must credit or retry. */
  deliveryFailed: number;
  /** Total settled value, by currency. */
  settledValue: Record<string, number>;
}

export function reconciliationSummary(receipts: X402Receipt[]): ReconciliationSummary {
  const settledValue: Record<string, number> = {};
  let delivered = 0;
  for (const receipt of receipts) {
    if (receipt.delivered) delivered += 1;
    settledValue[receipt.amount.currency] =
      (settledValue[receipt.amount.currency] ?? 0) + receipt.amount.value;
  }
  return {
    total: receipts.length,
    delivered,
    deliveryFailed: receipts.length - delivered,
    settledValue,
  };
}

/**
 * `GET /api/x402/receipts` — the operator's reconciliation view: what settled, what was delivered,
 * and what still needs crediting. The route table gates this with `auth: 'admin'`.
 */
export async function handleReceiptsRequest(ctx: RouteContext): Promise<Response> {
  const { env, correlationId, corsHeaders } = ctx;
  if (!receiptsBound(env)) {
    return badRequest('Receipts are not configured', 503, 'RECEIPTS_UNAVAILABLE', correlationId);
  }

  const requested = Number(ctx.url.searchParams.get('limit') ?? '100');
  const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 100, 1), 500);
  const receipts = await listReceipts(env, limit);

  return new Response(
    JSON.stringify({ receipts, reconciliation: reconciliationSummary(receipts) }),
    {
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        ...corsHeaders(ctx.request.headers.get('Origin')),
      },
    }
  );
}
