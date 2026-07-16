import { Env } from './types';
import { CustomerRecord, defaultFuseLimit, loadCustomer } from './customer';
import { ApiKeyRecord } from './api-keys';
import { consumeMonthlyQuota, peekMonthlyQuota, utcMonth } from './api-key-usage-do';

export interface BillableAuthContext {
  key: ApiKeyRecord;
  customer: CustomerRecord;
}

function effectiveFuseLimit(customer: CustomerRecord, env: Env): number {
  if (customer.fuseLimit > 0) return customer.fuseLimit;
  if (customer.plan === 'free') return defaultFuseLimit('free', env);
  // metered/enterprise with fuseLimit 0 => unlimited (still counted)
  return 0;
}

/**
 * After a successful HTTP 200 Billable unit: increment Customer monthly ledger, enforce fuse,
 * and best-effort report to Stripe for metered/enterprise (and free overage should not occur).
 */
export async function recordSuccessfulBillable(
  env: Env,
  ctx: BillableAuthContext,
  nowMs: number = Date.now()
): Promise<{ allowed: boolean; status: number; body?: Record<string, unknown> }> {
  const limit = effectiveFuseLimit(ctx.customer, env);
  const softWarn = Boolean(ctx.customer.fuseSoftWarn);
  // Hard-block uses limit; soft-warn / unlimited pass limit 0 into DO so increment always succeeds.
  const enforceLimit = softWarn || limit <= 0 ? 0 : limit;

  const usage = await consumeMonthlyQuota(env, ctx.customer.id, enforceLimit, nowMs);
  if (!usage.allowed) {
    return {
      allowed: false,
      status: 429,
      body: {
        error: 'Monthly usage fuse exceeded',
        code: 'FUSE_EXCEEDED',
        count: usage.count,
        limit,
        month: usage.month,
      },
    };
  }

  if (softWarn && limit > 0 && usage.count > limit) {
    console.warn(
      `[Billing] Customer ${ctx.customer.id} over fuse (${usage.count}/${limit}) soft-warn`
    );
  }

  if (ctx.customer.plan === 'metered' || ctx.customer.plan === 'enterprise') {
    void reportStripeMeter(env, ctx, 1);
  }

  return { allowed: true, status: 200 };
}

export async function peekCustomerUsage(env: Env, customerId: string): Promise<{
  month: string;
  count: number;
  limit: number;
}> {
  const customer = await loadCustomer(env, customerId);
  const limit = customer ? effectiveFuseLimit(customer, env) : 1000;
  const usage = await peekMonthlyQuota(env, customerId, limit);
  return { month: usage.month || utcMonth(Date.now()), count: usage.count, limit };
}

/** Best-effort Stripe Billing Meter event. DO ledger remains canonical. */
export async function reportStripeMeter(
  env: Env,
  ctx: BillableAuthContext,
  quantity: number
): Promise<void> {
  const secret = env.STRIPE_SECRET_KEY;
  const eventName = env.STRIPE_METER_EVENT_NAME || 'riding_lookup_api_call';
  if (!secret || !ctx.customer.stripeCustomerId) return;

  try {
    const body = new URLSearchParams();
    body.set('event_name', eventName);
    body.set('payload[stripe_customer_id]', ctx.customer.stripeCustomerId);
    body.set('payload[value]', String(quantity));
    body.set('identifier', `${ctx.customer.id}:${utcMonth(Date.now())}:${crypto.randomUUID()}`);

    const res = await fetch('https://api.stripe.com/v1/billing/meter_events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) {
      console.warn('[StripeMeter] event failed:', res.status, await res.text());
    }
  } catch (error) {
    console.warn('[StripeMeter] unavailable:', error);
  }
}
