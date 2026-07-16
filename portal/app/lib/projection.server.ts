import {
  mintKeyProjectionCore,
  revokeKeyProjectionCore,
  upsertCustomerProjectionCore,
  usageProjectionCore,
  type MintKeyInput,
} from '../../../src/projection-handlers';
import type { CustomerPlan, CustomerRecord } from '../../../src/customer';
import { requireCloudflareEnv } from '~/lib/cloudflare-context.server';

export type UpsertCustomerProjectionInput = {
  id: string;
  /** Loosely typed here so callers can pass the `customer_billing.plan` D1 column (plain text);
   *  the core function narrows/validates it against `CustomerPlan`. */
  plan: string;
  fuseLimit: number;
  fuseSoftWarn?: boolean;
  batchEnabled?: boolean;
  stripeCustomerId?: string;
  label?: string;
};

/**
 * In-process projection: the portal and the API worker (src/projection-handlers.ts) run in the
 * same Worker/isolate (see workers/app.ts), so these call straight into the KV-backed core
 * functions with the current request's `env` — no self-HTTP loop through a WORKER_PROJECTION_URL
 * (per the migration plan lock). If `API_KEYS` is unbound (soft free-tier launch — see
 * wrangler.jsonc), the underlying core functions throw the same "API_KEYS binding required"
 * error that the old HTTP path surfaced from the Worker.
 *
 * The HTTP Bearer path (`/admin/projection/*`, src/projection-handlers.ts's `handleProjectionRequest`,
 * reachable via the API-worker branch of workers/app.ts) stays available for external ops tooling
 * that isn't running inside this Worker.
 */
export async function upsertCustomerProjection(input: UpsertCustomerProjectionInput) {
  return upsertCustomerProjectionCore(requireCloudflareEnv(), {
    ...input,
    plan: input.plan as CustomerPlan,
  } satisfies Partial<CustomerRecord> & { id: string });
}

export async function mintKey(input: MintKeyInput) {
  return mintKeyProjectionCore(requireCloudflareEnv(), input);
}

export async function revokeKey(id: string) {
  return revokeKeyProjectionCore(requireCloudflareEnv(), id);
}

export async function fetchUsage(customerId: string) {
  return usageProjectionCore(requireCloudflareEnv(), customerId);
}
