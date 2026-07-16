import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordSuccessfulBillable } from '../src/billing';
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

function envWithMonthly(allowed: boolean, count: number, limit: number): Env {
  return {
    FREE_MONTHLY_ALLOWANCE: '1000',
    API_KEY_USAGE: {
      idFromName: () => 'id',
      get: () => ({
        fetch: async () =>
          new Response(
            JSON.stringify({
              allowed,
              count,
              limit,
              day: '2026-07',
              month: '2026-07',
            })
          ),
      }),
    },
  } as unknown as Env;
}

beforeEach(() => {
  clearApiKeyCache();
  clearCustomerCache();
});

describe('recordSuccessfulBillable', () => {
  it('hard-blocks when monthly fuse is exceeded', async () => {
    const customer: CustomerRecord = {
      id: 'cust_acme',
      plan: 'free',
      fuseLimit: 1000,
      fuseSoftWarn: false,
    };
    const result = await recordSuccessfulBillable(envWithMonthly(false, 1000, 1000), {
      key: KEY,
      customer,
    });
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(429);
    expect(result.body?.code).toBe('FUSE_EXCEEDED');
  });

  it('allows when under fuse', async () => {
    const customer: CustomerRecord = {
      id: 'cust_acme',
      plan: 'free',
      fuseLimit: 1000,
    };
    const result = await recordSuccessfulBillable(envWithMonthly(true, 1, 1000), {
      key: KEY,
      customer,
    });
    expect(result.allowed).toBe(true);
  });

  it('soft-warn continues past fuse (limit not enforced in DO)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      expect(url).toContain('limit=0');
      return new Response(
        JSON.stringify({ allowed: true, count: 1500, limit: 0, day: '2026-07', month: '2026-07' })
      );
    });
    const env = {
      FREE_MONTHLY_ALLOWANCE: '1000',
      API_KEY_USAGE: {
        idFromName: () => 'id',
        get: () => ({ fetch: fetchMock }),
      },
    } as unknown as Env;

    const customer: CustomerRecord = {
      id: 'cust_acme',
      plan: 'free',
      fuseLimit: 1000,
      fuseSoftWarn: true,
    };
    const result = await recordSuccessfulBillable(env, { key: KEY, customer });
    expect(result.allowed).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });
});
