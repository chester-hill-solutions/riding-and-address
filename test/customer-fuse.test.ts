import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearCustomerCache,
  CustomerRecordSchema,
  DEFAULT_FREE_MONTHLY_ALLOWANCE,
  defaultFuseLimit,
  deleteCustomer,
  loadCustomer,
  putCustomer,
} from '../src/customer';
import { createProjectionTestEnv } from './helpers/lookup-test-env';
import type { Env } from '../src/types';

/**
 * The Customer record and the allowance it resolves to.
 *
 * `src/customer.ts` sat at 70% statements and **45% branch** coverage — the branch coverage being
 * the sharper number, because the branches are exactly where the fuse comes from. A Customer's
 * monthly allowance decides whether their traffic is free, metered, or refused, and it is derived
 * from three things: the plan, the Customer's own limit, and the environment.
 */

let env: Env;

beforeEach(() => {
  clearCustomerCache();
  env = createProjectionTestEnv();
});

describe('the default fuse limit', () => {
  it('gives an enterprise Customer an unlimited fuse', () => {
    // Enterprise is the sales-assisted contract: it is not metered against a monthly allowance.
    expect(defaultFuseLimit('enterprise', env)).toBe(0);
  });

  it('gives a metered or free Customer the free allowance', () => {
    expect(defaultFuseLimit('metered', env)).toBe(DEFAULT_FREE_MONTHLY_ALLOWANCE);
    expect(defaultFuseLimit('free', env)).toBe(DEFAULT_FREE_MONTHLY_ALLOWANCE);
  });

  it('uses the environment allowance when there is one', () => {
    env.FREE_MONTHLY_ALLOWANCE = '250';
    expect(defaultFuseLimit('free', env)).toBe(250);
  });

  it('ignores an allowance that is not a number', () => {
    // A misconfigured environment must not set the fuse to NaN — a NaN limit would compare
    // strangely against every count, and the result would depend on the comparison rather than
    // on the policy.
    env.FREE_MONTHLY_ALLOWANCE = 'not-a-number';
    expect(defaultFuseLimit('free', env)).toBe(DEFAULT_FREE_MONTHLY_ALLOWANCE);
  });

  it('ignores an allowance of zero or less', () => {
    // Zero means "unlimited" for a Customer's own limit, but as the *default* it would mean every
    // free Customer is unlimited. The default falls back rather than opening the fuse.
    env.FREE_MONTHLY_ALLOWANCE = '0';
    expect(defaultFuseLimit('free', env)).toBe(DEFAULT_FREE_MONTHLY_ALLOWANCE);
    env.FREE_MONTHLY_ALLOWANCE = '-5';
    expect(defaultFuseLimit('free', env)).toBe(DEFAULT_FREE_MONTHLY_ALLOWANCE);
  });
});

describe('the Customer record', () => {
  it('round-trips through the key store', async () => {
    await putCustomer(env, {
      id: 'cust_1',
      plan: 'metered',
      fuseLimit: 500,
      batchEnabled: true,
      stripeCustomerId: 'cus_123',
      label: 'Acme',
    });

    const loaded = await loadCustomer(env, 'cust_1');
    expect(loaded).toMatchObject({
      id: 'cust_1',
      plan: 'metered',
      fuseLimit: 500,
      batchEnabled: true,
      stripeCustomerId: 'cus_123',
      label: 'Acme',
    });
    expect(loaded?.updatedAt).toBeTruthy();
  });

  it('is a miss for a Customer that does not exist', async () => {
    expect(await loadCustomer(env, 'cust_missing')).toBeNull();
  });

  it('is a miss for a Customer with no id', async () => {
    expect(await loadCustomer(env, '')).toBeNull();
  });

  it('is discarded when the stored record does not match the shape', async () => {
    // A record written by an older shape, or a corrupted one, must be discarded as a miss —
    // never trusted because it parses as JSON. The fuse and the meter both read this record.
    env.API_KEYS = await seedRaw('customer:cust_bad', { id: 'cust_bad', plan: 'platinum' });
    expect(await loadCustomer(env, 'cust_bad')).toBeNull();
  });

  it('is discarded when the stored record is missing the fields the fuse depends on', async () => {
    env.API_KEYS = await seedRaw('customer:cust_bad2', { id: 'cust_bad2' });
    expect(await loadCustomer(env, 'cust_bad2')).toBeNull();
  });

  it('can be deleted', async () => {
    await putCustomer(env, { id: 'cust_del', plan: 'free', fuseLimit: 100 });
    expect(await loadCustomer(env, 'cust_del')).not.toBeNull();
    await deleteCustomer(env, 'cust_del');
    expect(await loadCustomer(env, 'cust_del')).toBeNull();
  });

  it('refuses to write when the key store is not bound', async () => {
    // A write that silently went nowhere would leave the Customer record stale while the portal
    // believed it had been saved.
    env.API_KEYS = undefined;
    await expect(
      putCustomer(env, { id: 'c', plan: 'free', fuseLimit: 1 })
    ).rejects.toThrow(/API_KEYS/);
    await expect(deleteCustomer(env, 'c')).rejects.toThrow(/API_KEYS/);
  });
});

describe('the Customer schema', () => {
  it('requires the fields the fuse and the meter depend on', () => {
    // `id`, `plan` and `fuseLimit` are required because the decisions depend on them. A record
    // missing any of them is discarded rather than billed against.
    const parsed = CustomerRecordSchema.safeParse({ id: 'c', plan: 'free', fuseLimit: 10 });
    expect(parsed.success).toBe(true);

    expect(CustomerRecordSchema.safeParse({ id: 'c', plan: 'free' }).success).toBe(false);
    expect(CustomerRecordSchema.safeParse({ id: 'c', fuseLimit: 10 }).success).toBe(false);
    expect(CustomerRecordSchema.safeParse({ plan: 'free', fuseLimit: 10 }).success).toBe(false);
  });

  it('refuses a plan it does not implement', () => {
    expect(
      CustomerRecordSchema.safeParse({ id: 'c', plan: 'platinum', fuseLimit: 10 }).success
    ).toBe(false);
  });
});

/** A key store holding one raw value, so a malformed record can be planted. */
async function seedRaw(key: string, value: unknown): Promise<Env['API_KEYS']> {
  const { createMemoryKv } = await import('./helpers/memory-kv');
  const kv = createMemoryKv({ [key]: value });
  return kv;
}
