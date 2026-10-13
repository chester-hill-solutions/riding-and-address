import { describe, it, expect } from 'vitest';
import { recordSuccessfulBillable } from '../src/billing';
import { InMemoryUsageLedger, StaticUsageLedger } from '../src/usage-ledger';
import { clearCustomerCache, type CustomerRecord } from '../src/customer';
import { clearApiKeyCache, type ApiKeyRecord } from '../src/api-keys';
import { Env } from '../src/types';

const KEY: ApiKeyRecord = {
  id: 'sk_live_disp',
  kind: 'server',
  customerId: 'cust_acme',
  origins: [],
  dailyLimit: 0,
};

function envWithStripe(): Env {
  return { FREE_MONTHLY_ALLOWANCE: '1000' } as unknown as Env;
}

function customer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return { id: 'cust_acme', plan: 'free', fuseLimit: 1000, ...overrides };
}

beforeEach(() => {
  clearApiKeyCache();
  clearCustomerCache();
});

describe('recordSuccessfulBillable', () => {
  it('hard-blocks when the monthly fuse denies the increment', async () => {
    const ledger = new StaticUsageLedger({ allowed: false, count: 1000, limit: 1000, month: '2026-08' });
    const result = await recordSuccessfulBillable(envWithStripe(), { key: KEY, customer: customer() }, { ledger });
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(429);
    expect(result.body?.code).toBe('FUSE_EXCEEDED');
    expect(result.body?.count).toBe(1000);
  });

  it('allows when under fuse', async () => {
    const result = await recordSuccessfulBillable(
      envWithStripe(),
      { key: KEY, customer: customer() },
      { ledger: new InMemoryUsageLedger() }
    );
    expect(result.allowed).toBe(true);
  });

  it('soft-warn enforces limit=0 against the ledger so counting never blocks', async () => {
    const seenLimits: number[] = [];
    const ledger = {
      consumeMonthly: async (_cid: string, monthlyLimit: number) => {
        seenLimits.push(monthlyLimit);
        return { allowed: true, count: 1500, limit: monthlyLimit, month: '2026-08' };
      },
      peekMonthly: async () => ({ allowed: true, count: 0, limit: 0, month: '2026-08' })
    };
    const result = await recordSuccessfulBillable(
      envWithStripe(),
      { key: KEY, customer: customer({ fuseSoftWarn: true }) },
      { ledger }
    );
    expect(result.allowed).toBe(true);
    expect(seenLimits).toEqual([0]);
  });

  it('fail-closes a hard fuse when no usage binding exists (production adapter policy)', async () => {
    const result = await recordSuccessfulBillable(
      { FREE_MONTHLY_ALLOWANCE: '1000' } as unknown as Env,
      { key: KEY, customer: customer() }
    );
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(429);
    expect(result.body?.code).toBe('FUSE_EXCEEDED');
  });
});
