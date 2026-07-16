import { Env } from './types';

export type CustomerPlan = 'free' | 'metered' | 'enterprise';

/** Fallback free monthly Billable-unit allowance when env/plan does not override. */
export const DEFAULT_FREE_MONTHLY_ALLOWANCE = 1000;

export interface CustomerRecord {
  id: string;
  /** free | metered | enterprise */
  plan: CustomerPlan;
  /** Monthly Billable-unit ceiling. 0 = unlimited (Enterprise soft-warn path). */
  fuseLimit: number;
  /** When true, exceed fuse continues to serve (soft-warn); default hard-block. */
  fuseSoftWarn?: boolean;
  batchEnabled?: boolean;
  stripeCustomerId?: string;
  label?: string;
  updatedAt?: string;
}

const customerCache = new Map<string, { record: CustomerRecord | null; expires: number }>();
const CUSTOMER_CACHE_TTL_MS = 60_000;

export function clearCustomerCache(): void {
  customerCache.clear();
}

export async function loadCustomer(env: Env, customerId: string): Promise<CustomerRecord | null> {
  if (!env.API_KEYS || !customerId) return null;
  const cached = customerCache.get(customerId);
  if (cached && cached.expires > Date.now()) return cached.record;

  try {
    const record = (await env.API_KEYS.get(`customer:${customerId}`, 'json')) as CustomerRecord | null;
    customerCache.set(customerId, { record, expires: Date.now() + CUSTOMER_CACHE_TTL_MS });
    return record;
  } catch (error) {
    console.warn('Failed to load customer:', error);
    return null;
  }
}

export async function putCustomer(env: Env, record: CustomerRecord): Promise<void> {
  if (!env.API_KEYS) throw new Error('API_KEYS binding required');
  const next = { ...record, updatedAt: new Date().toISOString() };
  await env.API_KEYS.put(`customer:${record.id}`, JSON.stringify(next));
  customerCache.set(record.id, { record: next, expires: Date.now() + CUSTOMER_CACHE_TTL_MS });
}

export async function deleteCustomer(env: Env, customerId: string): Promise<void> {
  if (!env.API_KEYS) throw new Error('API_KEYS binding required');
  await env.API_KEYS.delete(`customer:${customerId}`);
  customerCache.set(customerId, { record: null, expires: Date.now() + CUSTOMER_CACHE_TTL_MS });
}

export function defaultFuseLimit(plan: CustomerPlan, env: Env): number {
  if (plan === 'enterprise') return 0;
  const raw = env.FREE_MONTHLY_ALLOWANCE;
  const n = raw ? parseInt(raw, 10) : DEFAULT_FREE_MONTHLY_ALLOWANCE;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_FREE_MONTHLY_ALLOWANCE;
}
