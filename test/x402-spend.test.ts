import { describe, it, expect } from 'vitest';
import { fromMicroUsd, toMicroUsd } from '../src/x402-spend-do';
import {
  DEFAULT_X402_PAYER_DAILY_CAP_USD,
  payerDailyCapUsd,
  releasePayerSpend,
  reservePayerSpend,
} from '../src/x402-spend';
import { fakeSpendNamespace, newSpendDO } from './helpers/fake-spend-do';
import { createLookupTestEnv } from './helpers/lookup-test-env';
import type { Env } from '../src/types';

/**
 * The per-payer spend cap (security review item 4). The offer ceiling bounds each offer; this bounds
 * the total. The cases that matter are the ones where it must *refuse*: past the cap, and when the
 * counter cannot be reached at all — this control fails closed, unlike the per-key quota.
 */

const PAYER = '0xAbC0000000000000000000000000000000000001';

const envWith = (overrides: Partial<Env> = {}): Env =>
  ({
    ...createLookupTestEnv(),
    X402_SPEND: fakeSpendNamespace(),
    X402_PAYER_DAILY_CAP_USD: '0.01',
    ...overrides,
  }) as unknown as Env;

describe('micro-USD conversion', () => {
  it('keeps a half-cent price, which cents would round to zero', () => {
    expect(toMicroUsd(0.005)).toBe(5000);
    expect(fromMicroUsd(5000)).toBe(0.005);
  });
});

describe('payerDailyCapUsd', () => {
  it('defaults conservatively when unset or unparseable', () => {
    expect(payerDailyCapUsd({} as Env)).toBe(DEFAULT_X402_PAYER_DAILY_CAP_USD);
    expect(payerDailyCapUsd({ X402_PAYER_DAILY_CAP_USD: 'not-a-number' } as Env)).toBe(
      DEFAULT_X402_PAYER_DAILY_CAP_USD
    );
  });

  it('honours a configured cap, including 0 to disable the control', () => {
    expect(payerDailyCapUsd({ X402_PAYER_DAILY_CAP_USD: '5' } as Env)).toBe(5);
    expect(payerDailyCapUsd({ X402_PAYER_DAILY_CAP_USD: '0' } as Env)).toBe(0);
  });
});

describe('reservePayerSpend', () => {
  it('accumulates spend and refuses past the cap', async () => {
    const env = envWith();
    // Cap 0.01 = two 0.005 reservations.
    expect((await reservePayerSpend(env, PAYER, 0.005)).ok).toBe(true);
    expect((await reservePayerSpend(env, PAYER, 0.005)).ok).toBe(true);

    const third = await reservePayerSpend(env, PAYER, 0.005);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.reason).toBe('cap_exceeded');
  });

  it('keeps payers independent', async () => {
    const env = envWith();
    await reservePayerSpend(env, PAYER, 0.005);
    await reservePayerSpend(env, PAYER, 0.005);
    // A different wallet has its own counter and is unaffected.
    expect((await reservePayerSpend(env, '0xother', 0.005)).ok).toBe(true);
  });

  it('treats one address as one payer regardless of casing', async () => {
    const env = envWith();
    await reservePayerSpend(env, PAYER, 0.005);
    await reservePayerSpend(env, PAYER.toUpperCase(), 0.005);
    const third = await reservePayerSpend(env, PAYER.toLowerCase(), 0.005);
    expect(third.ok).toBe(false);
  });

  it('refuses when the counter is unbound, rather than spending blind', async () => {
    const result = await reservePayerSpend(envWith({ X402_SPEND: undefined }), PAYER, 0.005);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('counter_unavailable');
  });

  it('skips the control entirely when the cap is 0', async () => {
    const env = envWith({ X402_PAYER_DAILY_CAP_USD: '0', X402_SPEND: undefined });
    expect((await reservePayerSpend(env, PAYER, 999)).ok).toBe(true);
  });
});

describe('releasePayerSpend', () => {
  it('gives a reservation back when no money moved', async () => {
    const env = envWith();
    await reservePayerSpend(env, PAYER, 0.005);
    await reservePayerSpend(env, PAYER, 0.005);
    await releasePayerSpend(env, PAYER, 0.005);
    // One unit is free again.
    expect((await reservePayerSpend(env, PAYER, 0.005)).ok).toBe(true);
  });

  it('never goes negative', async () => {
    const env = envWith();
    await releasePayerSpend(env, PAYER, 0.005);
    expect((await reservePayerSpend(env, PAYER, 0.01)).ok).toBe(true);
  });

  it('is a no-op without a binding, so it cannot fail the request that called it', async () => {
    await expect(releasePayerSpend(envWith({ X402_SPEND: undefined }), PAYER, 0.005)).resolves.toBeUndefined();
  });
});

describe('X402SpendDO', () => {
  it('does not increment a refused reservation', async () => {
    const instance = newSpendDO();
    const call = (path: string) => instance.fetch(new Request(`https://x402-spend${path}`, { method: 'POST' }));

    await call('/reserve?day=2026-10-17&amount=5000&cap=10000');
    await call('/reserve?day=2026-10-17&amount=5000&cap=10000');
    const refused = await (await call('/reserve?day=2026-10-17&amount=5000&cap=10000')).json() as {
      allowed: boolean; spent: number;
    };
    expect(refused.allowed).toBe(false);
    // The refused request must not inflate the counter the operator reads.
    expect(refused.spent).toBe(10000);
  });

  it('counts each UTC day separately', async () => {
    const instance = newSpendDO();
    const call = (path: string) => instance.fetch(new Request(`https://x402-spend${path}`, { method: 'POST' }));
    await call('/reserve?day=2026-10-17&amount=10000&cap=10000');
    expect((await (await call('/reserve?day=2026-10-18&amount=10000&cap=10000')).json() as { allowed: boolean }).allowed).toBe(true);
  });
});
