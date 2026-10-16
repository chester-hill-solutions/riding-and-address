/**
 * x402 reconciliation (ADR 0007, plan W11).
 *
 * A stored receipt says what we settled and what we delivered. It does **not** say whether the
 * settlement actually confirmed on chain: the facilitator reported success, but a broadcast
 * transaction can still fail or be reorged. This closes that gap — for every receipt carrying a
 * transaction it asks the chain for the status and records it, so an operator can tell what is
 * genuinely paid for from what merely looked settled.
 */

import { badRequest } from './utils';
import { listReceipts, recordReceipt, type X402Receipt } from './x402-receipts';
import type { RouteContext } from './route-context';
import type { Env } from './types';

export type Confirmation = 'confirmed' | 'failed' | 'unknown';

export interface ChainClient {
  statusOf(transaction: string, network: string): Promise<Confirmation>;
}

/**
 * EVM JSON-RPC. A transaction receipt with status `0x1` confirmed; `0x0` failed; absent means it is
 * not mined yet (or was dropped), which is `unknown` rather than either verdict.
 */
export class EvmRpcChainClient implements ChainClient {
  constructor(private rpcUrl: string) {}

  async statusOf(transaction: string): Promise<Confirmation> {
    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getTransactionReceipt',
          params: [transaction],
        }),
      });
      if (!response.ok) return 'unknown';
      const body = (await response.json()) as { result?: { status?: string } | null };
      if (!body.result) return 'unknown';
      return body.result.status === '0x1' ? 'confirmed' : 'failed';
    } catch {
      // A transport failure is not evidence about the chain.
      return 'unknown';
    }
  }
}

export interface ReconciliationReport {
  /** Receipts that carried a transaction and were checked. */
  checked: number;
  confirmed: number;
  failed: number;
  unknown: number;
  /** Settled but never delivered — the population an operator must credit or retry. */
  deliveryFailed: number;
  receipts: X402Receipt[];
}

export async function reconcileReceipts(
  env: Env,
  chain: ChainClient,
  options: { limit?: number; now?: Date } = {}
): Promise<ReconciliationReport> {
  const now = options.now ?? new Date();
  const receipts = await listReceipts(env, options.limit ?? 200);

  let checked = 0;
  let confirmed = 0;
  let failed = 0;
  let unknown = 0;

  for (const receipt of receipts) {
    const transaction = receipt.settlement.transaction;
    if (!transaction) continue;

    const confirmation = await chain.statusOf(transaction, receipt.settlement.network);
    checked += 1;
    if (confirmation === 'confirmed') confirmed += 1;
    else if (confirmation === 'failed') failed += 1;
    else unknown += 1;

    if (confirmation !== receipt.confirmation) {
      const checkedAt = now.toISOString();
      await recordReceipt(env, { ...receipt, confirmation, checkedAt });
      receipt.confirmation = confirmation;
      receipt.checkedAt = checkedAt;
    }
  }

  return {
    checked,
    confirmed,
    failed,
    unknown,
    deliveryFailed: receipts.filter((receipt) => !receipt.delivered).length,
    receipts,
  };
}

/**
 * `POST /api/x402/reconcile` — run reconciliation on demand. Admin-gated by the route table. A cron
 * trigger calling the same function is a one-line `wrangler.jsonc` addition; on-demand keeps this
 * from changing production behaviour until the rail is actually live.
 */
export async function handleReconcileRequest(ctx: RouteContext): Promise<Response> {
  const { env, correlationId, corsHeaders } = ctx;

  if (!env.X402_RPC_URL) {
    return badRequest('Reconciliation is not configured', 503, 'RECONCILE_UNAVAILABLE', correlationId);
  }

  const report = await reconcileReceipts(env, new EvmRpcChainClient(env.X402_RPC_URL));
  return new Response(JSON.stringify(report), {
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      ...corsHeaders(ctx.request.headers.get('Origin')),
    },
  });
}
